import { dirname } from 'node:path';
import type { ComposeExecutionRequest, ComposeSubCommand } from '../compose/compose-command.js';
import { buildComposeCommand } from '../compose/compose-command-builder.js';
import { executeComposeCommand } from '../compose/compose-executor.js';
import type { ComposeExecutionResult } from '../compose/compose-executor.js';
import type { ComposeCommandOptions } from '../compose/compose-options.js';
import type { PromptAdapter, PromptChoice } from '../guided/guided-command-resolver.js';
import { scanComposeFiles } from '../scanner/compose-file-scanner.js';
import type { ScanComposeFilesOptions } from '../scanner/compose-file-scanner.js';
import type { DiscoveredComposeProject } from '../scanner/discovered-project.js';

export const stackBrowserValues = {
  back: '__back__',
  quit: '__quit__',
} as const;

export type StackBrowserOptions = {
  maxDepth?: number;
  dryRun?: boolean;
  noAnsi?: boolean;
  projectName?: string;
  profile?: string[];
};

export type StackBrowserResult = {
  executedActions: number;
  failedActions: number;
  lastExitCode?: number;
};

export type StackBrowserDependencies = {
  prompts: PromptAdapter;
  scan?: (root: string, options: ScanComposeFilesOptions) => Promise<DiscoveredComposeProject[]>;
  execute?: (request: ComposeExecutionRequest) => Promise<ComposeExecutionResult>;
  print?: (message: string) => void;
  warn?: (message: string) => void;
};

type StackAction = 'ps' | 'up' | 'build' | 'stop' | 'restart' | 'logs' | 'down' | 'services';
type ServiceAction = 'up' | 'build' | 'stop' | 'restart' | 'logs' | 'shell';

const stackActionChoices: PromptChoice[] = [
  { name: 'Inspecter les conteneurs de la stack (ps)', value: 'ps' },
  { name: 'Démarrer la stack en arrière-plan (up -d)', value: 'up' },
  { name: 'Builder toute la stack', value: 'build' },
  { name: 'Stopper la stack', value: 'stop' },
  { name: 'Redémarrer la stack', value: 'restart' },
  { name: 'Afficher les logs de la stack', value: 'logs' },
  { name: 'Descendre la stack (down)', value: 'down' },
  { name: 'Explorer les services', value: 'services' },
  { name: 'Retour à la liste des stacks', value: stackBrowserValues.back },
  { name: 'Quitter', value: stackBrowserValues.quit },
];

const serviceActionChoices: PromptChoice[] = [
  { name: 'Démarrer ce service (up -d)', value: 'up' },
  { name: 'Builder ce service', value: 'build' },
  { name: 'Stopper ce service', value: 'stop' },
  { name: 'Redémarrer ce service', value: 'restart' },
  { name: 'Afficher les logs de ce service', value: 'logs' },
  { name: 'Ouvrir un shell sh dans ce service', value: 'shell' },
  { name: 'Retour aux services', value: stackBrowserValues.back },
  { name: 'Quitter', value: stackBrowserValues.quit },
];

export async function browseComposeStacks(
  root: string,
  options: StackBrowserOptions,
  dependencies: StackBrowserDependencies,
): Promise<StackBrowserResult> {
  const scan = dependencies.scan ?? scanComposeFiles;
  const projects = await scan(root, createScanOptions(options));
  const result: StackBrowserResult = {
    executedActions: 0,
    failedActions: 0,
  };

  if (projects.length === 0) {
    print(dependencies, 'No Docker Compose stacks found.');
    return result;
  }

  for (const project of projects) {
    for (const warning of project.warnings) {
      warn(dependencies, `${project.relativePath}: ${warning}`);
    }
  }

  let browsingStacks = true;

  while (browsingStacks) {
    const projectId = await dependencies.prompts.select({
      message: 'Sélectionne une stack Compose',
      choices: [...createStackChoices(projects), { name: 'Quitter', value: stackBrowserValues.quit }],
    });

    if (projectId === stackBrowserValues.quit) {
      browsingStacks = false;
      continue;
    }

    const project = projects.find((candidate) => candidate.id === projectId);

    if (project === undefined) {
      warn(dependencies, `Unknown stack selection: ${projectId}`);
      continue;
    }

    const stackResult = await browseStack(project, options, dependencies);
    result.executedActions += stackResult.executedActions;
    result.failedActions += stackResult.failedActions;

    if (stackResult.lastExitCode !== undefined) {
      result.lastExitCode = stackResult.lastExitCode;
    }

    if (stackResult.lastExitCode === StackBrowserExitCode.quit) {
      browsingStacks = false;
    }
  }

  return normalizeQuitExitCode(result);
}

export function createStackChoices(projects: DiscoveredComposeProject[]): PromptChoice[] {
  return projects.map((project) => ({
    name: formatProjectChoice(project),
    value: project.id,
  }));
}

export function createStackBrowserExecutionRequest(
  project: DiscoveredComposeProject,
  command: ComposeSubCommand,
  services: string[],
  options: StackBrowserOptions,
  commandOptions: ComposeCommandOptions = {},
  passthroughArgs: string[] = [],
): ComposeExecutionRequest {
  return {
    composeFilePath: project.composeFilePath,
    workingDirectory: dirname(project.composeFilePath),
    command,
    services,
    passthroughArgs,
    options: {
      ...createBaseComposeOptions(options),
      ...commandOptions,
    },
  };
}

async function browseStack(
  project: DiscoveredComposeProject,
  options: StackBrowserOptions,
  dependencies: StackBrowserDependencies,
): Promise<StackBrowserResult> {
  const result: StackBrowserResult = {
    executedActions: 0,
    failedActions: 0,
  };
  let browsingStack = true;

  while (browsingStack) {
    const action = await dependencies.prompts.select({
      message: `Stack ${project.name} — choisis une action`,
      choices: stackActionChoices,
    });

    if (action === stackBrowserValues.quit) {
      result.lastExitCode = StackBrowserExitCode.quit;
      return result;
    }

    if (action === stackBrowserValues.back) {
      browsingStack = false;
      continue;
    }

    if (action === 'services') {
      const serviceResult = await browseServices(project, options, dependencies);
      result.executedActions += serviceResult.executedActions;
      result.failedActions += serviceResult.failedActions;

      if (serviceResult.lastExitCode !== undefined) {
        result.lastExitCode = serviceResult.lastExitCode;
      }

      if (serviceResult.lastExitCode === StackBrowserExitCode.quit) {
        return result;
      }

      continue;
    }

    const request = await createStackActionRequest(project, action as StackAction, options, dependencies);

    if (request === undefined) {
      continue;
    }

    await executeBrowserRequest(request, result, dependencies);
  }

  return result;
}

async function browseServices(
  project: DiscoveredComposeProject,
  options: StackBrowserOptions,
  dependencies: StackBrowserDependencies,
): Promise<StackBrowserResult> {
  const result: StackBrowserResult = {
    executedActions: 0,
    failedActions: 0,
  };

  if (project.services.length === 0) {
    print(dependencies, 'No services detected in this stack.');
    return result;
  }

  let browsingServices = true;

  while (browsingServices) {
    const service = await dependencies.prompts.select({
      message: `Stack ${project.name} — sélectionne un service`,
      choices: [
        ...project.services.map((serviceName) => ({ name: serviceName, value: serviceName })),
        { name: 'Retour à la stack', value: stackBrowserValues.back },
        { name: 'Quitter', value: stackBrowserValues.quit },
      ],
    });

    if (service === stackBrowserValues.quit) {
      result.lastExitCode = StackBrowserExitCode.quit;
      return result;
    }

    if (service === stackBrowserValues.back) {
      browsingServices = false;
      continue;
    }

    const serviceResult = await browseService(project, service, options, dependencies);
    result.executedActions += serviceResult.executedActions;
    result.failedActions += serviceResult.failedActions;

    if (serviceResult.lastExitCode !== undefined) {
      result.lastExitCode = serviceResult.lastExitCode;
    }

    if (serviceResult.lastExitCode === StackBrowserExitCode.quit) {
      return result;
    }
  }

  return result;
}

async function browseService(
  project: DiscoveredComposeProject,
  service: string,
  options: StackBrowserOptions,
  dependencies: StackBrowserDependencies,
): Promise<StackBrowserResult> {
  const result: StackBrowserResult = {
    executedActions: 0,
    failedActions: 0,
  };
  let browsingService = true;

  while (browsingService) {
    const action = await dependencies.prompts.select({
      message: `Service ${service} — choisis une action`,
      choices: serviceActionChoices,
    });

    if (action === stackBrowserValues.quit) {
      result.lastExitCode = StackBrowserExitCode.quit;
      return result;
    }

    if (action === stackBrowserValues.back) {
      browsingService = false;
      continue;
    }

    const request = createServiceActionRequest(project, service, action as ServiceAction, options);
    await executeBrowserRequest(request, result, dependencies);
  }

  return result;
}

async function createStackActionRequest(
  project: DiscoveredComposeProject,
  action: StackAction,
  options: StackBrowserOptions,
  dependencies: StackBrowserDependencies,
): Promise<ComposeExecutionRequest | undefined> {
  if (action === 'down') {
    const confirmed = await dependencies.prompts.confirm({
      message: `Confirmer l'arrêt complet de la stack ${project.name} avec docker compose down ?`,
      defaultValue: false,
    });

    if (!confirmed) {
      return undefined;
    }
  }

  const commandByAction: Record<Exclude<StackAction, 'services'>, ComposeExecutionRequest> = {
    ps: createStackBrowserExecutionRequest(project, 'ps', [], options),
    up: createStackBrowserExecutionRequest(project, 'up', [], options, { detach: true }),
    build: createStackBrowserExecutionRequest(project, 'build', [], options),
    stop: createStackBrowserExecutionRequest(project, 'stop', [], options),
    restart: createStackBrowserExecutionRequest(project, 'restart', [], options),
    logs: createStackBrowserExecutionRequest(project, 'logs', [], options, { tail: '100' }),
    down: createStackBrowserExecutionRequest(project, 'down', [], options),
  };

  return commandByAction[action];
}

function createServiceActionRequest(
  project: DiscoveredComposeProject,
  service: string,
  action: ServiceAction,
  options: StackBrowserOptions,
): ComposeExecutionRequest {
  const commandByAction: Record<ServiceAction, ComposeExecutionRequest> = {
    up: createStackBrowserExecutionRequest(project, 'up', [service], options, { detach: true }),
    build: createStackBrowserExecutionRequest(project, 'build', [service], options),
    stop: createStackBrowserExecutionRequest(project, 'stop', [service], options),
    restart: createStackBrowserExecutionRequest(project, 'restart', [service], options),
    logs: createStackBrowserExecutionRequest(project, 'logs', [service], options, { tail: '100' }),
    shell: createStackBrowserExecutionRequest(project, 'exec', [service], options, {}, ['sh']),
  };

  return commandByAction[action];
}

async function executeBrowserRequest(
  request: ComposeExecutionRequest,
  result: StackBrowserResult,
  dependencies: StackBrowserDependencies,
): Promise<void> {
  const execute = dependencies.execute ?? executeComposeCommand;
  result.executedActions += 1;

  if (request.options.dryRun === true) {
    print(dependencies, buildComposeCommand(request).displayCommand);
    result.lastExitCode = 0;
    return;
  }

  const executionResult = await execute(request);
  result.lastExitCode = executionResult.exitCode;

  if (executionResult.exitCode !== 0) {
    result.failedActions += 1;
    warn(dependencies, `Command failed with exit code ${executionResult.exitCode}: ${executionResult.command}`);
  }
}

function createScanOptions(options: StackBrowserOptions): ScanComposeFilesOptions {
  return options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth };
}

function createBaseComposeOptions(options: StackBrowserOptions): ComposeCommandOptions {
  return {
    ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
    ...(options.noAnsi === undefined ? {} : { noAnsi: options.noAnsi }),
    ...(options.projectName === undefined ? {} : { projectName: options.projectName }),
    ...(options.profile === undefined ? {} : { profile: options.profile }),
  };
}

function formatProjectChoice(project: DiscoveredComposeProject): string {
  const services = project.services.length === 0 ? 'no services detected' : project.services.join(', ');
  const warnings = project.warnings.length === 0 ? '' : ' — warnings';

  return `${project.relativePath} (${services})${warnings}`;
}

function print(dependencies: StackBrowserDependencies, message: string): void {
  const writer = dependencies.print ?? console.log;
  writer(message);
}

function warn(dependencies: StackBrowserDependencies, message: string): void {
  const writer = dependencies.warn ?? console.warn;
  writer(message);
}

function normalizeQuitExitCode(result: StackBrowserResult): StackBrowserResult {
  if (result.lastExitCode !== StackBrowserExitCode.quit) {
    return result;
  }

  return {
    executedActions: result.executedActions,
    failedActions: result.failedActions,
    lastExitCode: 0,
  };
}

const StackBrowserExitCode = {
  quit: -1,
} as const;
