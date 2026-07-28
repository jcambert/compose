import { readFile, writeFile } from 'node:fs/promises';

async function main() {
  await updateStackBrowser();
  await updateStackBrowserCommand();
  await updateStackBrowserTests();
  await updateReadme();
  await updateBacklog();
}

async function updateStackBrowser() {
  const path = 'src/interactive/stack-browser.ts';
  let content = await readFile(path, 'utf-8');

  content = replaceOnce(content, `export const stackBrowserValues = {
  back: '__back__',
  quit: '__quit__',
  refresh: '__refresh__',
} as const;
`, `export const stackBrowserValues = {
  back: '__back__',
  quit: '__quit__',
  refresh: '__refresh__',
  filter: '__filter__',
  clearFilter: '__clear_filter__',
  sort: '__sort__',
} as const;

export type StackBrowserSortMode = 'name' | 'path' | 'services' | 'runtime';

export type StackBrowserViewOptions = {
  filter?: string;
  sort?: StackBrowserSortMode;
};
`);

  content = replaceOnce(content, `  workspaceName?: string;
  favoriteStackIds?: string[];
};
`, `  workspaceName?: string;
  favoriteStackIds?: string[];
  stackFilter?: string;
  stackSort?: StackBrowserSortMode;
};
`);

  content = replaceOnce(content, `const serviceActionChoices: PromptChoice[] = [
  createMenuChoice('↻', '[Inspect] Refresh', 'rafraîchir les statuts runtime', 'refresh'),
  createMenuChoice('▶', '[Lifecycle] Up service', 'docker compose up -d <service>', 'up'),
  createMenuChoice('◇', '[Lifecycle] Create service', 'docker compose create <service>', 'create'),
  createMenuChoice('◆', '[Lifecycle] Build service', 'docker compose build <service>', 'build'),
  createMenuChoice('▷', '[Lifecycle] Start service', 'docker compose start <service>', 'start'),
  createMenuChoice('■', '[Lifecycle] Stop service', 'docker compose stop <service>', 'stop'),
  createMenuChoice('⏸', '[Lifecycle] Pause service', 'docker compose pause <service>', 'pause'),
  createMenuChoice('▶', '[Lifecycle] Unpause service', 'docker compose unpause <service>', 'unpause'),
  createMenuChoice('↺', '[Lifecycle] Restart service', 'docker compose restart <service>', 'restart'),
  createMenuChoice('◷', '[Tools] Logs service', 'docker compose logs --tail 100 <service>', 'logs'),
  createMenuChoice('▤', '[Tools] Top service', 'docker compose top <service>', 'top'),
  createMenuChoice('🔌', '[Tools] Port service', 'docker compose port <service> <private-port>', 'port'),
  createMenuChoice('▣', '[Tools] Shell', 'docker compose exec <service> sh', 'shell'),
  createMenuChoice('☠', '[Danger] Kill service', 'docker compose kill <service>', 'kill'),
  createMenuChoice('🗑', '[Danger] Remove service', 'docker compose rm <service>', 'rm'),
  createMenuChoice('←', 'Back', 'retour aux services', stackBrowserValues.back),
  createMenuChoice('✕', 'Quit', 'fermer le browser', stackBrowserValues.quit),
];
`, `const serviceActionChoices: PromptChoice[] = [
  createMenuChoice('↻', '[Inspect] Refresh', 'rafraîchir les statuts runtime', 'refresh'),
  createMenuChoice('▶', '[Lifecycle] Up service', 'docker compose up -d <service>', 'up'),
  createMenuChoice('◇', '[Lifecycle] Create service', 'docker compose create <service>', 'create'),
  createMenuChoice('◆', '[Lifecycle] Build service', 'docker compose build <service>', 'build'),
  createMenuChoice('▷', '[Lifecycle] Start service', 'docker compose start <service>', 'start'),
  createMenuChoice('■', '[Lifecycle] Stop service', 'docker compose stop <service>', 'stop'),
  createMenuChoice('⏸', '[Lifecycle] Pause service', 'docker compose pause <service>', 'pause'),
  createMenuChoice('▶', '[Lifecycle] Unpause service', 'docker compose unpause <service>', 'unpause'),
  createMenuChoice('↺', '[Lifecycle] Restart service', 'docker compose restart <service>', 'restart'),
  createMenuChoice('◷', '[Tools] Logs service', 'docker compose logs --tail 100 <service>', 'logs'),
  createMenuChoice('▤', '[Tools] Top service', 'docker compose top <service>', 'top'),
  createMenuChoice('🔌', '[Tools] Port service', 'docker compose port <service> <private-port>', 'port'),
  createMenuChoice('▣', '[Tools] Shell', 'docker compose exec <service> sh', 'shell'),
  createMenuChoice('☠', '[Danger] Kill service', 'docker compose kill <service>', 'kill'),
  createMenuChoice('🗑', '[Danger] Remove service', 'docker compose rm <service>', 'rm'),
  createMenuChoice('←', 'Back', 'retour aux services', stackBrowserValues.back),
  createMenuChoice('✕', 'Quit', 'fermer le browser', stackBrowserValues.quit),
];

const stackSortChoices: PromptChoice[] = [
  createMenuChoice('A', 'Name', 'tri alphabétique par nom de stack', 'name'),
  createMenuChoice('↳', 'Path', 'tri par chemin relatif du fichier Compose', 'path'),
  createMenuChoice('▦', 'Services', 'stacks avec le plus de services en premier', 'services'),
  createMenuChoice('●', 'Runtime', 'running puis partial, stopped, unavailable', 'runtime'),
];
`);

  content = replaceOnce(content, `  let runtimeStatuses = await readRuntimeStatuses(projects, options, dependencies);
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
`, `  let runtimeStatuses = await readRuntimeStatuses(projects, options, dependencies);
  const favoriteStackIds = new Set(options.favoriteStackIds ?? []);
  let stackFilter = options.stackFilter?.trim() ?? '';
  let stackSort = options.stackSort ?? 'name';
  let browsingStacks = true;

  while (browsingStacks) {
    const visibleProjects = filterProjectsForBrowser(projects, stackFilter);
    printHomeMenu(root, projects, visibleProjects, options, runtimeStatuses, dependencies, { filter: stackFilter, sort: stackSort });

    const projectId = await dependencies.prompts.select({
      message: 'Select a stack',
      choices: [
        ...createStackChoices(projects, runtimeStatuses, favoriteStackIds, { filter: stackFilter, sort: stackSort }),
        createMenuChoice('⌕', 'Filter', stackFilter.length === 0 ? 'filtrer par nom, chemin ou service' : `filtre actif: ${stackFilter}`, stackBrowserValues.filter),
        ...(stackFilter.length === 0 ? [] : [createMenuChoice('⌧', 'Clear filter', 'afficher toutes les stacks', stackBrowserValues.clearFilter)]),
        createMenuChoice('⇅', 'Sort', `tri actuel: ${formatStackSortMode(stackSort)}`, stackBrowserValues.sort),
        createMenuChoice('↻', 'Refresh', 'rafraîchir les statuts runtime', stackBrowserValues.refresh),
        createMenuChoice('✕', 'Quit', 'fermer le browser', stackBrowserValues.quit),
      ],
    });
`);

  content = replaceOnce(content, `    if (projectId === stackBrowserValues.refresh) {
      runtimeStatuses = await readRuntimeStatuses(projects, options, dependencies);
      print(dependencies, 'Runtime status refreshed.');
      continue;
    }

    const project = projects.find((candidate) => candidate.id === projectId);
`, `    if (projectId === stackBrowserValues.refresh) {
      runtimeStatuses = await readRuntimeStatuses(projects, options, dependencies);
      print(dependencies, 'Runtime status refreshed.');
      continue;
    }

    if (projectId === stackBrowserValues.filter) {
      stackFilter = (await dependencies.prompts.input({
        message: 'Filter stacks by name, path, service or warning. Leave empty to clear:',
        defaultValue: stackFilter,
      })).trim();
      continue;
    }

    if (projectId === stackBrowserValues.clearFilter) {
      stackFilter = '';
      print(dependencies, 'Stack filter cleared.');
      continue;
    }

    if (projectId === stackBrowserValues.sort) {
      stackSort = await askStackSortMode(dependencies, stackSort);
      print(dependencies, `Stack sort set to: ${formatStackSortMode(stackSort)}.`);
      continue;
    }

    const project = projects.find((candidate) => candidate.id === projectId);
`);

  content = replaceOnce(content, `export function createStackChoices(
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
`, `export function createStackChoices(
  projects: DiscoveredComposeProject[],
  runtimeStatuses: ReadonlyMap<string, StackRuntimeStatus> = new Map<string, StackRuntimeStatus>(),
  favoriteStackIds: ReadonlySet<string> | string[] = new Set<string>(),
  viewOptions: StackBrowserViewOptions = {},
): PromptChoice[] {
  const favoriteSet = toFavoriteSet(favoriteStackIds);
  const filteredProjects = filterProjectsForBrowser(projects, viewOptions.filter);

  return sortProjectsForBrowser(filteredProjects, favoriteSet, runtimeStatuses, viewOptions.sort ?? 'name').map((project, index) => ({
    name: formatProjectChoice(project, index + 1, runtimeStatuses.get(project.id), favoriteSet.has(project.relativePath)),
    value: project.id,
  }));
}

export function filterProjectsForBrowser(projects: DiscoveredComposeProject[], filter: string | undefined): DiscoveredComposeProject[] {
  const search = normalizeSearchValue(filter ?? '');

  if (search.length === 0) {
    return projects;
  }

  return projects.filter((project) => createProjectSearchValues(project).some((value) => normalizeSearchValue(value).includes(search)));
}

export function sortProjectsForBrowser(
  projects: DiscoveredComposeProject[],
  favoriteStackIds: ReadonlySet<string> | string[] = new Set<string>(),
  runtimeStatuses: ReadonlyMap<string, StackRuntimeStatus> = new Map<string, StackRuntimeStatus>(),
  sortMode: StackBrowserSortMode = 'name',
): DiscoveredComposeProject[] {
  const favoriteSet = toFavoriteSet(favoriteStackIds);

  return [...projects].sort((left, right) => {
    const favoriteCompare = Number(favoriteSet.has(right.relativePath)) - Number(favoriteSet.has(left.relativePath));

    if (favoriteCompare !== 0) {
      return favoriteCompare;
    }

    return compareProjectsBySortMode(left, right, runtimeStatuses, sortMode) || compareProjectsByName(left, right);
  });
}
`);

  content = replaceOnce(content, `function createMenuChoice(icon: string, label: string, hint: string, value: string): PromptChoice {
  return {
    name: `${icon} ${label.padEnd(24)} ${hint}`,
    value,
  };
}
`, `function createMenuChoice(icon: string, label: string, hint: string, value: string): PromptChoice {
  return {
    name: `${icon} ${label.padEnd(24)} ${hint}`,
    value,
  };
}

async function askStackSortMode(dependencies: StackBrowserDependencies, currentSort: StackBrowserSortMode): Promise<StackBrowserSortMode> {
  const selectedSort = await dependencies.prompts.select({
    message: 'Sort stacks by',
    choices: stackSortChoices.map((choice) => ({
      name: choice.value === currentSort ? `✓ ${choice.name}` : choice.name,
      value: choice.value,
    })),
  });

  return isStackBrowserSortMode(selectedSort) ? selectedSort : currentSort;
}

function isStackBrowserSortMode(value: string): value is StackBrowserSortMode {
  return value === 'name' || value === 'path' || value === 'services' || value === 'runtime';
}
`);

  content = replaceOnce(content, `function toFavoriteSet(favoriteStackIds: ReadonlySet<string> | string[]): ReadonlySet<string> {
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
`, `function toFavoriteSet(favoriteStackIds: ReadonlySet<string> | string[]): ReadonlySet<string> {
  return Array.isArray(favoriteStackIds) ? new Set(favoriteStackIds) : favoriteStackIds;
}

function createProjectSearchValues(project: DiscoveredComposeProject): string[] {
  return [
    project.name,
    project.relativePath,
    project.composeFilePath,
    project.directoryPath,
    ...project.services,
    ...project.warnings,
  ];
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function compareProjectsBySortMode(
  left: DiscoveredComposeProject,
  right: DiscoveredComposeProject,
  runtimeStatuses: ReadonlyMap<string, StackRuntimeStatus>,
  sortMode: StackBrowserSortMode,
): number {
  if (sortMode === 'path') {
    return left.relativePath.localeCompare(right.relativePath) || left.name.localeCompare(right.name);
  }

  if (sortMode === 'services') {
    return right.services.length - left.services.length || compareProjectsByName(left, right);
  }

  if (sortMode === 'runtime') {
    return getProjectRuntimeRank(left, runtimeStatuses.get(left.id)) - getProjectRuntimeRank(right, runtimeStatuses.get(right.id));
  }

  return compareProjectsByName(left, right);
}

function compareProjectsByName(left: DiscoveredComposeProject, right: DiscoveredComposeProject): number {
  return left.name.localeCompare(right.name) || left.relativePath.localeCompare(right.relativePath);
}

function getProjectRuntimeRank(project: DiscoveredComposeProject, runtimeStatus: StackRuntimeStatus | undefined): number {
  if (project.warnings.length > 0) {
    return 5;
  }

  if (runtimeStatus === undefined) {
    return 4;
  }

  const ranks: Record<StackRuntimeStatus['state'], number> = {
    running: 0,
    partial: 1,
    stopped: 2,
    unavailable: 3,
    unknown: 4,
  };

  return ranks[runtimeStatus.state];
}

function formatStackSortMode(sortMode: StackBrowserSortMode): string {
  const labels: Record<StackBrowserSortMode, string> = {
    name: 'name',
    path: 'path',
    services: 'services',
    runtime: 'runtime status',
  };

  return labels[sortMode];
}

function printHomeMenu(
  root: string,
  projects: DiscoveredComposeProject[],
  visibleProjects: DiscoveredComposeProject[],
  options: StackBrowserOptions,
  runtimeStatuses: ReadonlyMap<string, StackRuntimeStatus>,
  dependencies: StackBrowserDependencies,
  viewOptions: Required<StackBrowserViewOptions>,
): void {
  printMenuPanel(dependencies, 'Compose Browser', [
    `Root: ${root}`,
    ...(options.workspaceName === undefined ? [] : [`Workspace: ${options.workspaceName}`]),
    `Stacks: ${formatVisibleStackCount(projects.length, visibleProjects.length)}`,
    `Runtime: ${formatRuntimeOverview(visibleProjects, runtimeStatuses)}`,
    `Sort: ${formatStackSortMode(viewOptions.sort)}`,
    ...(viewOptions.filter.length === 0 ? [] : [`Filter: ${viewOptions.filter}`]),
    `Mode: ${options.dryRun === true ? 'dry-run preview' : 'execute commands'}`,
    'Navigate with arrows, press Enter to select.',
    'Use Filter to narrow by stack name, path, service or warning.',
  ]);
}

function formatVisibleStackCount(totalCount: number, visibleCount: number): string {
  return visibleCount === totalCount ? `${totalCount}` : `${visibleCount}/${totalCount} visible`;
}
`);

  await writeFile(path, content);
}

async function updateStackBrowserCommand() {
  const path = 'src/cli/interactive-stack-browser-command.ts';
  let content = await readFile(path, 'utf-8');

  content = replaceOnce(content, `import type { StackBrowserOptions } from '../interactive/stack-browser.js';
`, `import type { StackBrowserOptions, StackBrowserSortMode } from '../interactive/stack-browser.js';
`);

  content = replaceOnce(content, `    .option('--dry-run', 'print generated docker compose commands without executing them')
    .option('--no-ansi', 'disable ANSI output from docker compose')
`, `    .option('--dry-run', 'print generated docker compose commands without executing them')
    .option('--no-ansi', 'disable ANSI output from docker compose')
    .option('--filter <text>', 'initial stack browser filter by name, path, service or warning')
    .option('--sort <mode>', 'initial stack browser sort: name, path, services or runtime', parseStackSortMode)
`);

  content = replaceOnce(content, `    ...(options.noAnsi === undefined ? {} : { noAnsi: options.noAnsi }),
  };
}

function parseInteger(value: string): number {
`, `    ...(options.noAnsi === undefined ? {} : { noAnsi: options.noAnsi }),
    ...(options.filter === undefined ? {} : { stackFilter: options.filter }),
    ...(options.sort === undefined ? {} : { stackSort: options.sort }),
  };
}

function parseInteger(value: string): number {
`);

  content = replaceOnce(content, `function parseInteger(value: string): number {
  const parsedValue = Number.parseInt(value, 10);

  if (Number.isNaN(parsedValue)) {
    throw new Error(`Invalid integer: ${value}`);
  }

  return parsedValue;
}

`, `function parseInteger(value: string): number {
  const parsedValue = Number.parseInt(value, 10);

  if (Number.isNaN(parsedValue)) {
    throw new Error(`Invalid integer: ${value}`);
  }

  return parsedValue;
}

function parseStackSortMode(value: string): StackBrowserSortMode {
  if (value === 'name' || value === 'path' || value === 'services' || value === 'runtime') {
    return value;
  }

  throw new Error(`Invalid stack sort mode: ${value}. Expected name, path, services or runtime.`);
}

`);

  content = replaceOnce(content, `  dryRun?: boolean;
  noAnsi?: boolean;
};
`, `  dryRun?: boolean;
  noAnsi?: boolean;
  filter?: string;
  sort?: StackBrowserSortMode;
};
`);

  await writeFile(path, content);
}

async function updateStackBrowserTests() {
  const path = 'tests/unit/stack-browser.test.ts';
  let content = await readFile(path, 'utf-8');

  content = replaceOnce(content, `  createStackBrowserExecutionRequest,
  createStackChoices,
  stackBrowserValues,
`, `  createStackBrowserExecutionRequest,
  createStackChoices,
  filterProjectsForBrowser,
  sortProjectsForBrowser,
  stackBrowserValues,
`);

  content = replaceOnce(content, `  it('puts favorite stacks first in browser choices', () => {
    const projects = [
      createProject({ id: 'stack-2', name: 'monitoring', relativePath: 'monitoring/compose.yaml' }),
      createProject(),
    ];
    const choices = createStackChoices(projects, createRuntimeStatusMap(projects), ['infra/compose.yaml']);

    expect(choices[0]).toEqual({ name: '★ 1. infra           2 services · 1 running · 1 stopped · infra/compose.yaml', value: 'stack-1' });
    expect(choices[1]?.value).toBe('stack-2');
  });

`, `  it('puts favorite stacks first in browser choices', () => {
    const projects = [
      createProject({ id: 'stack-2', name: 'monitoring', relativePath: 'monitoring/compose.yaml' }),
      createProject(),
    ];
    const choices = createStackChoices(projects, createRuntimeStatusMap(projects), ['infra/compose.yaml']);

    expect(choices[0]).toEqual({ name: '★ 1. infra           2 services · 1 running · 1 stopped · infra/compose.yaml', value: 'stack-1' });
    expect(choices[1]?.value).toBe('stack-2');
  });

  it('filters stack choices by name, path, service or warning', () => {
    const projects = [
      createProject({ id: 'stack-api', name: 'api', relativePath: 'apps/api/compose.yaml', services: ['web'] }),
      createProject({ id: 'stack-worker', name: 'jobs', relativePath: 'workers/compose.yaml', services: ['worker'] }),
      createProject({ id: 'stack-broken', name: 'broken', relativePath: 'broken/compose.yaml', services: [], warnings: ['invalid yaml'] }),
    ];

    expect(filterProjectsForBrowser(projects, 'worker').map((project) => project.id)).toEqual(['stack-worker']);
    expect(filterProjectsForBrowser(projects, 'invalid').map((project) => project.id)).toEqual(['stack-broken']);
    expect(createStackChoices(projects, createRuntimeStatusMap(projects), [], { filter: 'apps' })).toEqual([
      { name: '○ 1. api             1 service · 0 running · 1 stopped · apps/api/compose.yaml', value: 'stack-api' },
    ]);
  });

  it('sorts visible stack choices by path, service count or runtime status', () => {
    const running = createProject({ id: 'running', name: 'api', relativePath: 'z-api/compose.yaml', services: ['api', 'db', 'cache'] });
    const stopped = createProject({ id: 'stopped', name: 'worker', relativePath: 'a-worker/compose.yaml', services: ['worker'] });
    const warning = createProject({ id: 'warning', name: 'broken', relativePath: 'm-broken/compose.yaml', services: [], warnings: ['invalid yaml'] });
    const runtimeStatuses = new Map<string, StackRuntimeStatus>([
      [running.id, createStackRuntimeStatus(running, [{ serviceName: 'api', state: 'running', containerCount: 1, ports: [], containerNames: ['api-1'] }])],
      [stopped.id, createStackRuntimeStatus(stopped, [{ serviceName: 'worker', state: 'stopped', containerCount: 0, ports: [], containerNames: [] }])],
      [warning.id, createRuntimeStatus(warning)],
    ]);
    const projects = [stopped, warning, running];

    expect(sortProjectsForBrowser(projects, [], runtimeStatuses, 'path').map((project) => project.id)).toEqual(['stopped', 'warning', 'running']);
    expect(sortProjectsForBrowser(projects, [], runtimeStatuses, 'services').map((project) => project.id)).toEqual(['running', 'stopped', 'warning']);
    expect(sortProjectsForBrowser(projects, [], runtimeStatuses, 'runtime').map((project) => project.id)).toEqual(['running', 'stopped', 'warning']);
  });

`);

  content = replaceOnce(content, `  it('refreshes runtime status from the interactive browser', async () => {
`, `  it('updates the stack filter from the interactive browser', async () => {
    const printedMessages: string[] = [];
    const projects = [
      createProject(),
      createProject({ id: 'stack-2', name: 'monitoring', relativePath: 'monitoring/compose.yaml', services: ['grafana'] }),
    ];

    await browseComposeStacks(
      '.',
      {},
      {
        prompts: createPromptAdapter([stackBrowserValues.filter, stackBrowserValues.quit], [], ['monitoring']),
        async scan() {
          return projects;
        },
        async readRuntimeStatus(project) {
          return createRuntimeStatus(project);
        },
        print(message) {
          printedMessages.push(message);
        },
      },
    );

    expect(printedMessages.some((message) => message.includes('Stacks: 1/2 visible'))).toBe(true);
    expect(printedMessages.some((message) => message.includes('Filter: monitoring'))).toBe(true);
  });

  it('updates the stack sort from the interactive browser', async () => {
    const selectedChoices: PromptChoice[][] = [];
    const projects = [
      createProject({ id: 'stack-2', name: 'monitoring', relativePath: 'monitoring/compose.yaml', services: ['grafana'] }),
      createProject(),
    ];
    const prompts: PromptAdapter = {
      ...createPromptAdapter([]),
      async select(question: { choices: PromptChoice[] }): Promise<string> {
        selectedChoices.push(question.choices);
        if (selectedChoices.length === 1) {
          return stackBrowserValues.sort;
        }
        if (selectedChoices.length === 2) {
          return 'path';
        }
        return stackBrowserValues.quit;
      },
    };

    await browseComposeStacks(
      '.',
      {},
      {
        prompts,
        async scan() {
          return projects;
        },
        async readRuntimeStatus(project) {
          return createRuntimeStatus(project);
        },
      },
    );

    expect(selectedChoices[2]?.[0]?.value).toBe('stack-1');
  });

  it('refreshes runtime status from the interactive browser', async () => {
`);

  await writeFile(path, content);
}

async function updateReadme() {
  const path = 'README.md';
  let content = await readFile(path, 'utf-8');

  content = replaceOnce(content, `compose browse C:\Sources --max-depth 8
compose stacks . --dry-run
`, `compose browse C:\Sources --max-depth 8
compose browse C:\Sources --filter api --sort runtime
compose stacks . --filter monitoring --sort path --dry-run
`);

  content = replaceOnce(content, `The browser is menu-first and designed for day-to-day terminal usage. It reads live state with ` + '`docker compose ps --format json`' + ` and falls back cleanly when Docker is unavailable.
`, `The browser is menu-first and designed for day-to-day terminal usage. It reads live state with ` + '`docker compose ps --format json`' + ` and falls back cleanly when Docker is unavailable.

Use ` + '`--filter`' + ` to start with a narrowed stack list, then use the interactive Filter action to refine it without leaving the browser. Use ` + '`--sort name|path|services|runtime`' + ` to choose the initial ordering; favorites remain first.
`);

  content = replaceOnce(content, `│ Stacks: 3
│ Runtime: 1 running · 1 partial · 1 stopped · 0 unavailable
│ Mode: execute commands
│ Navigate with arrows, press Enter to select.
`, `│ Stacks: 3
│ Runtime: 1 running · 1 partial · 1 stopped · 0 unavailable
│ Sort: runtime status
│ Mode: execute commands
│ Navigate with arrows, press Enter to select.
│ Use Filter to narrow by stack name, path, service or warning.
`);

  content = replaceOnce(content, `  ↻ Refresh            rafraîchir les statuts runtime
  ✕ Quit               fermer le browser
`, `  ⌕ Filter             filtrer par nom, chemin ou service
  ⇅ Sort               tri actuel: runtime status
  ↻ Refresh            rafraîchir les statuts runtime
  ✕ Quit               fermer le browser
`);

  await writeFile(path, content);
}

async function updateBacklog() {
  const path = 'docs/backlog.md';
  let content = await readFile(path, 'utf-8');

  content = replaceOnce(content, `- React GUI MVP.
`, `- React GUI MVP.
- Browser filtering and sorting.
`);

  content = replaceOnce(content, `- Add filtering in stack selection.
- Sort by favorites, recents and runtime status.
- Improve unavailable/error status display.
- Keep refresh actions clear.
- Improve large-directory usability.
`, `- Add filtering in stack selection.
- Add sort modes for name, path, service count and runtime status.
- Keep favorites ahead of the selected sort mode.
- Improve unavailable/error status display.
- Keep refresh actions clear.
- Improve large-directory usability.
`);

  content = replaceOnce(content, `Candidate PR: ` + '`feat: improve browser filtering and sorting`' + `.
`, `Status: completed in PR #25.
`);

  await writeFile(path, content);
}

function replaceOnce(content, search, replacement) {
  if (!content.includes(search)) {
    throw new Error(`Expected content not found:\n${search.slice(0, 500)}`);
  }

  return content.replace(search, replacement);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
