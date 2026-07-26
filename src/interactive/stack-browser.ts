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
  createMenuChoice('▦', 'Services', 'explorer les services de cette stack', 'services'),
  createMenuChoice('●', 'Status', 'docker compose ps', 'ps'),
  createMenuChoice('▶', 'Start', 'docker compose up -d', 'up'),
  createMenuChoice('◆', 'Build', 'docker compose build', 'build'),
  createMenuChoice('■', 'Stop', 'docker compose stop', 'stop'),
  createMenuChoice('↻', 'Restart', 'docker compose restart', 'restart'),
  createMenuChoice('◷', 'Logs', 'docker compose logs --tail 100', 'logs'),
  createMenuChoice('⚠', 'Down', 'arrêter et retirer les conteneurs', 'down'),
  createMenuChoice('←', 'Back', 'retour à la liste des stacks', stackBrowserValues.back),
  createMenuChoice('✕', 'Quit', 'fermer le browser', stackBrowserValues.quit),
];

const serviceActionChoices: PromptChoice[] = [
  createMenuChoice('▶', 'Start service', 'docker compose up -d <service>', 'up'),
  createMenuChoice('◆', 'Build service', 'docker compose build <service>', 'build'),
  createMenuChoice('■', 'Stop service', 'docker compose stop <service>', 'stop'),
  createMenuChoice('↻', 'Restart service', 'docker compose restart <service>', 'restart'),
  createMenuChoice('◷', 'Logs service', 'docker compose logs --tail 100 <service>', 'logs'),
  createMenuChoice('▣', 'Shell', 'docker compose exec <service> sh', 'shell'),
  createMenuChoice('←', 'Back', 'retour aux services', stackBrowserValues.back),
  createMenuChoice('✕', 'Quit', 'fermer le browser', stackBrowserValues.quit),
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
    printMenuPanel(dependencies, 'Compose Browser', [
      `Root: ${root}`,
      'No Docker Compose stacks found.',
    ]);
    return result;
  }

  printWarnings(projects, dependencies);

  let browsingStacks = true;

  while (browsingStacks) {
    printHomeMenu(root, projects, options, dependencies);

    const projectId = await dependencies.prompts.select({
      message: 'Select a stack',
      choices: [...createStackChoices(projects), createMenuChoice('✕', 'Quit', 'fermer le browser', stackBrowserValues.quit)],
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
  return projects.map((project, index) => ({
    name: formatProjectChoice(project, index + 1),
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
    printStackMenu(project, options, dependencies);

    const action = await dependencies.prompts.select({
      message: 'Choose an action',
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
    printMenuPanel(dependencies, `Stack: ${project.name}`, [
      'No services detected in this stack.',
      `File: ${project.relativePath}`,
    ]);
    return result;
  }

  let browsingServices = true;

  while (browsingServices) {
    printServicesMenu(project, dependencies);

    const service = await dependencies.prompts.select({
      message: 'Select a service',
      choices: [
        ...project.services.map((serviceName, index) => createServiceChoice(serviceName, index + 1)),
        createMenuChoice('←', 'Back', 'retour à la stack', stackBrowserValues.back),
        createMenuChoice('✕', 'Quit', 'fermer le browser', stackBrowserValues.quit),
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
    printServiceMenu(project, service, options, dependencies);

    const action = await dependencies.prompts.select({
      message: 'Choose a service action',
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
  if (action === 'services') {
    return undefined;
  }

  if (action === 'down') {
    const confirmed = await dependencies.prompts.confirm({
      message: `Confirmer docker compose down sur ${project.name} ?`,
      defaultValue: false,
    });

    if (!confirmed) {
      print(dependencies, 'Action annulée.');
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
    print(dependencies, `Preview: ${buildComposeCommand(request).displayCommand}`);
    result.lastExitCode = 0;
    return;
  }

  const executionResult = await execute(request);
  result.lastExitCode = executionResult.exitCode;

  if (executionResult.exitCode !== 0) {
    result.failedActions += 1;
    warn(dependencies, `Command failed with exit code ${executionResult.exitCode}: ${executionResult.command}`);
    return;
  }

  print(dependencies, `Done: ${executionResult.command}`);
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

function createMenuChoice(icon: string, label: string, hint: string, value: string): PromptChoice {
  return {
    name: `${icon} ${label.padEnd(18)} ${hint}`,
    value,
  };
}

function createServiceChoice(serviceName: string, index: number): PromptChoice {
  return createMenuChoice('▣', `${index}. ${serviceName}`, 'service', serviceName);
}

function formatProjectChoice(project: DiscoveredComposeProject, index: number): string {
  const status = project.warnings.length === 0 ? 'ready' : `${project.warnings.length} warning(s)`;
  const detail = `${formatServiceCount(project.services.length)} · ${status} · ${project.relativePath}`;

  return `▣ ${`${index}. ${project.name}`.padEnd(18)} ${detail}`;
}

function formatServiceCount(count: number): string {
  if (count === 0) {
    return 'no services';
  }

  if (count === 1) {
    return '1 service';
  }

  return `${count} services`;
}

function printHomeMenu(
  root: string,
  projects: DiscoveredComposeProject[],
  options: StackBrowserOptions,
  dependencies: StackBrowserDependencies,
): void {
  printMenuPanel(dependencies, 'Compose Browser', [
    `Root: ${root}`,
    `Stacks: ${projects.length}`,
    `Mode: ${options.dryRun === true ? 'dry-run preview' : 'execute commands'}`,
    'Navigate with arrows, press Enter to select.',
  ]);
}

function printStackMenu(
  project: DiscoveredComposeProject,
  options: StackBrowserOptions,
  dependencies: StackBrowserDependencies,
): void {
  printMenuPanel(dependencies, `Stack: ${project.name}`, [
    `File: ${project.relativePath}`,
    `Services: ${project.services.length === 0 ? 'none detected' : project.services.join(', ')}`,
    `Mode: ${options.dryRun === true ? 'dry-run preview' : 'execute commands'}`,
  ]);
}

function printServicesMenu(project: DiscoveredComposeProject, dependencies: StackBrowserDependencies): void {
  printMenuPanel(dependencies, `Services: ${project.name}`, [
    `File: ${project.relativePath}`,
    `Available services: ${project.services.length}`,
  ]);
}

function printServiceMenu(
  project: DiscoveredComposeProject,
  service: string,
  options: StackBrowserOptions,
  dependencies: StackBrowserDependencies,
): void {
  printMenuPanel(dependencies, `Service: ${service}`, [
    `Stack: ${project.name}`,
    `File: ${project.relativePath}`,
    `Mode: ${options.dryRun === true ? 'dry-run preview' : 'execute commands'}`,
  ]);
}

function printWarnings(projects: DiscoveredComposeProject[], dependencies: StackBrowserDependencies): void {
  for (const project of projects) {
    for (const warning of project.warnings) {
      warn(dependencies, `${project.relativePath}: ${warning}`);
    }
  }
}

function printMenuPanel(dependencies: StackBrowserDependencies, title: string, lines: string[]): void {
  const content = [
    '',
    '╭─ ' + title + ' ' + '─'.repeat(Math.max(1, 62 - title.length)),
    ...lines.map((line) => `│ ${line}`),
    '╰' + '─'.repeat(66),
  ];

  print(dependencies, content.join('\n'));
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
