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
import {
  createUnavailableStackRuntimeStatus,
  formatServiceRuntimeSummary,
  readStackRuntimeStatus,
} from './stack-runtime-status.js';
import type { ServiceRuntimeStatus, StackRuntimeStatus } from './stack-runtime-status.js';

export const stackBrowserValues = {
  back: '__back__',
  quit: '__quit__',
  refresh: '__refresh__',
} as const;

export type StackBrowserOptions = {
  maxDepth?: number;
  dryRun?: boolean;
  noAnsi?: boolean;
  projectName?: string;
  profile?: string[];
  workspaceName?: string;
  favoriteStackIds?: string[];
};

export type StackBrowserResult = {
  executedActions: number;
  failedActions: number;
  lastExitCode?: number;
};

export type StackRuntimeStatusReader = (
  project: DiscoveredComposeProject,
  options: StackBrowserOptions,
) => Promise<StackRuntimeStatus>;

export type StackBrowserDependencies = {
  prompts: PromptAdapter;
  scan?: (root: string, options: ScanComposeFilesOptions) => Promise<DiscoveredComposeProject[]>;
  execute?: (request: ComposeExecutionRequest) => Promise<ComposeExecutionResult>;
  readRuntimeStatus?: StackRuntimeStatusReader;
  setFavorite?: (project: DiscoveredComposeProject, favorite: boolean) => Promise<void>;
  recordRecent?: (project: DiscoveredComposeProject) => Promise<void>;
  print?: (message: string) => void;
  warn?: (message: string) => void;
};

type StackAction = 'ps' | 'up' | 'build' | 'stop' | 'restart' | 'logs' | 'down' | 'services' | 'refresh' | 'favorite';
type ServiceAction = 'up' | 'build' | 'stop' | 'restart' | 'logs' | 'shell';

const stackActionChoices: PromptChoice[] = [
  createMenuChoice('▦', 'Services', 'explorer les services de cette stack', 'services'),
  createMenuChoice('★', 'Favorite', 'ajouter ou retirer des favoris', 'favorite'),
  createMenuChoice('↻', 'Refresh', 'rafraîchir les statuts runtime', 'refresh'),
  createMenuChoice('●', 'Status', 'docker compose ps', 'ps'),
  createMenuChoice('▶', 'Start', 'docker compose up -d', 'up'),
  createMenuChoice('◆', 'Build', 'docker compose build', 'build'),
  createMenuChoice('■', 'Stop', 'docker compose stop', 'stop'),
  createMenuChoice('↺', 'Restart', 'docker compose restart', 'restart'),
  createMenuChoice('◷', 'Logs', 'docker compose logs --tail 100', 'logs'),
  createMenuChoice('⚠', 'Down', 'arrêter et retirer les conteneurs', 'down'),
  createMenuChoice('←', 'Back', 'retour à la liste des stacks', stackBrowserValues.back),
  createMenuChoice('✕', 'Quit', 'fermer le browser', stackBrowserValues.quit),
];

const serviceActionChoices: PromptChoice[] = [
  createMenuChoice('↻', 'Refresh', 'rafraîchir les statuts runtime', 'refresh'),
  createMenuChoice('▶', 'Start service', 'docker compose up -d <service>', 'up'),
  createMenuChoice('◆', 'Build service', 'docker compose build <service>', 'build'),
  createMenuChoice('■', 'Stop service', 'docker compose stop <service>', 'stop'),
  createMenuChoice('↺', 'Restart service', 'docker compose restart <service>', 'restart'),
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
      ...(options.workspaceName === undefined ? [] : [`Workspace: ${options.workspaceName}`]),
      'No Docker Compose stacks found.',
    ]);
    return result;
  }

  printWarnings(projects, dependencies);

  let runtimeStatuses = await readRuntimeStatuses(projects, options, dependencies);
  const favoriteStackIds = new Set(options.favoriteStackIds ?? []);
  let browsingStacks = true;

  while (browsingStacks) {
    printHomeMenu(root, projects, options, runtimeStatuses, dependencies);

    const projectId = await dependencies.prompts.select({
      message: 'Select a stack',
      choices: [
        ...createStackChoices(projects, runtimeStatuses, favoriteStackIds),
        createMenuChoice('↻', 'Refresh', 'rafraîchir les statuts runtime', stackBrowserValues.refresh),
        createMenuChoice('✕', 'Quit', 'fermer le browser', stackBrowserValues.quit),
      ],
    });

    if (projectId === stackBrowserValues.quit) {
      browsingStacks = false;
      continue;
    }

    if (projectId === stackBrowserValues.refresh) {
      runtimeStatuses = await readRuntimeStatuses(projects, options, dependencies);
      print(dependencies, 'Runtime status refreshed.');
      continue;
    }

    const project = projects.find((candidate) => candidate.id === projectId);

    if (project === undefined) {
      warn(dependencies, `Unknown stack selection: ${projectId}`);
      continue;
    }

    await dependencies.recordRecent?.(project);

    const stackResult = await browseStack(project, options, runtimeStatuses, favoriteStackIds, dependencies);
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

export function createStackChoices(
  projects: DiscoveredComposeProject[],
  runtimeStatuses: ReadonlyMap<string, StackRuntimeStatus> = new Map<string, StackRuntimeStatus>(),
  favoriteStackIds: ReadonlySet<string> | string[] = new Set<string>(),
): PromptChoice[] {
  const favoriteSet = toFavoriteSet(favoriteStackIds);

  return sortProjectsForBrowser(projects, favoriteSet).map((project, index) => ({
    name: formatProjectChoice(project, index + 1, runtimeStatuses.get(project.id), favoriteSet.has(project.relativePath)),
    value: project.id,
  }));
}

export function sortProjectsForBrowser(
  projects: DiscoveredComposeProject[],
  favoriteStackIds: ReadonlySet<string> | string[] = new Set<string>(),
): DiscoveredComposeProject[] {
  const favoriteSet = toFavoriteSet(favoriteStackIds);

  return [...projects].sort((left, right) => {
    const favoriteCompare = Number(favoriteSet.has(right.relativePath)) - Number(favoriteSet.has(left.relativePath));

    if (favoriteCompare !== 0) {
      return favoriteCompare;
    }

    return left.name.localeCompare(right.name) || left.relativePath.localeCompare(right.relativePath);
  });
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
  runtimeStatuses: Map<string, StackRuntimeStatus>,
  favoriteStackIds: Set<string>,
  dependencies: StackBrowserDependencies,
): Promise<StackBrowserResult> {
  const result: StackBrowserResult = {
    executedActions: 0,
    failedActions: 0,
  };
  let browsingStack = true;

  while (browsingStack) {
    printStackMenu(project, options, runtimeStatuses.get(project.id), dependencies);

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

    if (action === stackBrowserValues.refresh) {
      await refreshProjectRuntimeStatus(project, options, runtimeStatuses, dependencies);
      print(dependencies, 'Runtime status refreshed.');
      continue;
    }

    if (action === 'favorite') {
      const favorite = !favoriteStackIds.has(project.relativePath);

      if (favorite) {
        favoriteStackIds.add(project.relativePath);
      } else {
        favoriteStackIds.delete(project.relativePath);
      }

      await dependencies.setFavorite?.(project, favorite);
      print(dependencies, favorite ? `Favorite added: ${project.name}` : `Favorite removed: ${project.name}`);
      continue;
    }

    if (action === 'services') {
      const serviceResult = await browseServices(project, options, runtimeStatuses, dependencies);
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
    await refreshProjectRuntimeStatusAfterExecution(project, options, runtimeStatuses, dependencies, request.options.dryRun === true);
  }

  return result;
}

async function browseServices(
  project: DiscoveredComposeProject,
  options: StackBrowserOptions,
  runtimeStatuses: Map<string, StackRuntimeStatus>,
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
    const runtimeStatus = runtimeStatuses.get(project.id);
    printServicesMenu(project, runtimeStatus, dependencies);

    const service = await dependencies.prompts.select({
      message: 'Select a service',
      choices: [
        ...project.services.map((serviceName, index) => createServiceChoice(serviceName, index + 1, runtimeStatus?.services[serviceName])),
        createMenuChoice('↻', 'Refresh', 'rafraîchir les statuts runtime', stackBrowserValues.refresh),
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

    if (service === stackBrowserValues.refresh) {
      await refreshProjectRuntimeStatus(project, options, runtimeStatuses, dependencies);
      print(dependencies, 'Runtime status refreshed.');
      continue;
    }

    const serviceResult = await browseService(project, service, options, runtimeStatuses, dependencies);
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
  runtimeStatuses: Map<string, StackRuntimeStatus>,
  dependencies: StackBrowserDependencies,
): Promise<StackBrowserResult> {
  const result: StackBrowserResult = {
    executedActions: 0,
    failedActions: 0,
  };
  let browsingService = true;

  while (browsingService) {
    printServiceMenu(project, service, options, runtimeStatuses.get(project.id)?.services[service], dependencies);

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

    if (action === stackBrowserValues.refresh) {
      await refreshProjectRuntimeStatus(project, options, runtimeStatuses, dependencies);
      print(dependencies, 'Runtime status refreshed.');
      continue;
    }

    const request = createServiceActionRequest(project, service, action as ServiceAction, options);
    await executeBrowserRequest(request, result, dependencies);
    await refreshProjectRuntimeStatusAfterExecution(project, options, runtimeStatuses, dependencies, request.options.dryRun === true);
  }

  return result;
}

async function createStackActionRequest(
  project: DiscoveredComposeProject,
  action: StackAction,
  options: StackBrowserOptions,
  dependencies: StackBrowserDependencies,
): Promise<ComposeExecutionRequest | undefined> {
  if (action === 'services' || action === 'refresh' || action === 'favorite') {
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

  const commandByAction: Record<Exclude<StackAction, 'services' | 'refresh' | 'favorite'>, ComposeExecutionRequest> = {
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

async function readRuntimeStatuses(
  projects: DiscoveredComposeProject[],
  options: StackBrowserOptions,
  dependencies: StackBrowserDependencies,
): Promise<Map<string, StackRuntimeStatus>> {
  const runtimeStatuses = new Map<string, StackRuntimeStatus>();

  for (const project of projects) {
    runtimeStatuses.set(project.id, await readRuntimeStatus(project, options, dependencies));
  }

  return runtimeStatuses;
}

async function refreshProjectRuntimeStatus(
  project: DiscoveredComposeProject,
  options: StackBrowserOptions,
  runtimeStatuses: Map<string, StackRuntimeStatus>,
  dependencies: StackBrowserDependencies,
): Promise<void> {
  runtimeStatuses.set(project.id, await readRuntimeStatus(project, options, dependencies));
}

async function refreshProjectRuntimeStatusAfterExecution(
  project: DiscoveredComposeProject,
  options: StackBrowserOptions,
  runtimeStatuses: Map<string, StackRuntimeStatus>,
  dependencies: StackBrowserDependencies,
  skippedBecauseDryRun: boolean,
): Promise<void> {
  if (skippedBecauseDryRun) {
    return;
  }

  await refreshProjectRuntimeStatus(project, options, runtimeStatuses, dependencies);
}

async function readRuntimeStatus(
  project: DiscoveredComposeProject,
  options: StackBrowserOptions,
  dependencies: StackBrowserDependencies,
): Promise<StackRuntimeStatus> {
  const reader = dependencies.readRuntimeStatus ?? readStackRuntimeStatus;

  try {
    return await reader(project, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Docker runtime status is unavailable.';
    return createUnavailableStackRuntimeStatus(project, message);
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

function createMenuChoice(icon: string, label: string, hint: string, value: string): PromptChoice {
  return {
    name: `${icon} ${label.padEnd(18)} ${hint}`,
    value,
  };
}

function createServiceChoice(serviceName: string, index: number, runtimeStatus: ServiceRuntimeStatus | undefined): PromptChoice {
  return createMenuChoice(formatServiceStateIcon(runtimeStatus), `${index}. ${serviceName}`, formatServiceRuntimeSummary(runtimeStatus), serviceName);
}

function formatProjectChoice(
  project: DiscoveredComposeProject,
  index: number,
  runtimeStatus: StackRuntimeStatus | undefined,
  favorite: boolean,
): string {
  const detail = `${formatServiceCount(project.services.length)} · ${formatStackRuntimeLabel(project, runtimeStatus)} · ${project.relativePath}`;
  const icon = favorite ? '★' : formatStackStateIcon(runtimeStatus);

  return `${icon} ${`${index}. ${project.name}`.padEnd(18)} ${detail}`;
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

function formatStackRuntimeLabel(project: DiscoveredComposeProject, runtimeStatus: StackRuntimeStatus | undefined): string {
  if (project.warnings.length > 0) {
    return `${project.warnings.length} warning(s)`;
  }

  if (runtimeStatus === undefined) {
    return 'runtime unknown';
  }

  return runtimeStatus.summary;
}

function formatStackStateIcon(runtimeStatus: StackRuntimeStatus | undefined): string {
  if (runtimeStatus === undefined) {
    return '?';
  }

  const icons: Record<StackRuntimeStatus['state'], string> = {
    running: '●',
    partial: '◐',
    stopped: '○',
    unavailable: '◇',
    unknown: '?',
  };

  return icons[runtimeStatus.state];
}

function formatServiceStateIcon(runtimeStatus: ServiceRuntimeStatus | undefined): string {
  if (runtimeStatus === undefined) {
    return '?';
  }

  const icons: Record<ServiceRuntimeStatus['state'], string> = {
    running: '●',
    stopped: '○',
    exited: '○',
    unhealthy: '!',
    unknown: '?',
  };

  return icons[runtimeStatus.state];
}

function toFavoriteSet(favoriteStackIds: ReadonlySet<string> | string[]): ReadonlySet<string> {
  return Array.isArray(favoriteStackIds) ? new Set(favoriteStackIds) : favoriteStackIds;
}

function printHomeMenu(
  root: string,
  projects: DiscoveredComposeProject[],
  options: StackBrowserOptions,
  runtimeStatuses: ReadonlyMap<string, StackRuntimeStatus>,
  dependencies: StackBrowserDependencies,
): void {
  printMenuPanel(dependencies, 'Compose Browser', [
    `Root: ${root}`,
    ...(options.workspaceName === undefined ? [] : [`Workspace: ${options.workspaceName}`]),
    `Stacks: ${projects.length}`,
    `Runtime: ${formatRuntimeOverview(projects, runtimeStatuses)}`,
    `Mode: ${options.dryRun === true ? 'dry-run preview' : 'execute commands'}`,
    'Navigate with arrows, press Enter to select.',
  ]);
}

function printStackMenu(
  project: DiscoveredComposeProject,
  options: StackBrowserOptions,
  runtimeStatus: StackRuntimeStatus | undefined,
  dependencies: StackBrowserDependencies,
): void {
  printMenuPanel(dependencies, `Stack: ${project.name}`, [
    `File: ${project.relativePath}`,
    `Services: ${project.services.length === 0 ? 'none detected' : project.services.join(', ')}`,
    `Runtime: ${runtimeStatus === undefined ? 'unknown' : runtimeStatus.summary}`,
    ...(runtimeStatus?.warning === undefined ? [] : [`Runtime warning: ${runtimeStatus.warning}`]),
    `Mode: ${options.dryRun === true ? 'dry-run preview' : 'execute commands'}`,
  ]);
}

function printServicesMenu(
  project: DiscoveredComposeProject,
  runtimeStatus: StackRuntimeStatus | undefined,
  dependencies: StackBrowserDependencies,
): void {
  printMenuPanel(dependencies, `Services: ${project.name}`, [
    `File: ${project.relativePath}`,
    `Runtime: ${runtimeStatus === undefined ? 'unknown' : runtimeStatus.summary}`,
    ...formatServiceRuntimeLines(project, runtimeStatus),
  ]);
}

function printServiceMenu(
  project: DiscoveredComposeProject,
  service: string,
  options: StackBrowserOptions,
  runtimeStatus: ServiceRuntimeStatus | undefined,
  dependencies: StackBrowserDependencies,
): void {
  printMenuPanel(dependencies, `Service: ${service}`, [
    `Stack: ${project.name}`,
    `File: ${project.relativePath}`,
    `Runtime: ${formatServiceRuntimeSummary(runtimeStatus)}`,
    `Mode: ${options.dryRun === true ? 'dry-run preview' : 'execute commands'}`,
  ]);
}

function formatServiceRuntimeLines(
  project: DiscoveredComposeProject,
  runtimeStatus: StackRuntimeStatus | undefined,
): string[] {
  if (project.services.length === 0) {
    return ['Available services: none'];
  }

  return project.services.map((serviceName) => {
    const serviceStatus = runtimeStatus?.services[serviceName];
    return `${formatServiceStateIcon(serviceStatus)} ${serviceName.padEnd(18)} ${formatServiceRuntimeSummary(serviceStatus)}`;
  });
}

function formatRuntimeOverview(
  projects: DiscoveredComposeProject[],
  runtimeStatuses: ReadonlyMap<string, StackRuntimeStatus>,
): string {
  const statuses = projects.map((project) => runtimeStatuses.get(project.id)).filter((status): status is StackRuntimeStatus => status !== undefined);

  if (statuses.length === 0) {
    return 'unknown';
  }

  const runningStacks = statuses.filter((status) => status.state === 'running').length;
  const partialStacks = statuses.filter((status) => status.state === 'partial').length;
  const stoppedStacks = statuses.filter((status) => status.state === 'stopped').length;
  const unavailableStacks = statuses.filter((status) => status.state === 'unavailable').length;

  return `${runningStacks} running · ${partialStacks} partial · ${stoppedStacks} stopped · ${unavailableStacks} unavailable`;
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
