import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { DiscoveredComposeProject } from '../scanner/discovered-project.js';
import {
  createEmptyWorkspaceConfig,
  workspaceConfigVersion,
} from './workspace-config.js';
import type { FavoriteStack, RecentStack, WorkspaceConfig, WorkspaceDefinition } from './workspace-config.js';

const maxRecentStacks = 20;

export type WorkspaceStore = {
  configPath: string;
  load(): Promise<WorkspaceConfig>;
  save(config: WorkspaceConfig): Promise<void>;
};

export function createWorkspaceStore(configPath = resolveWorkspaceConfigPath()): WorkspaceStore {
  return {
    configPath,
    async load(): Promise<WorkspaceConfig> {
      try {
        const content = await readFile(configPath, 'utf-8');
        return normalizeWorkspaceConfig(JSON.parse(content));
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
          return createEmptyWorkspaceConfig();
        }

        throw error;
      }
    },
    async save(config: WorkspaceConfig): Promise<void> {
      await mkdir(dirname(configPath), { recursive: true });
      await writeFile(configPath, `${JSON.stringify(normalizeWorkspaceConfig(config), null, 2)}\n`, 'utf-8');
    },
  };
}

export function resolveWorkspaceConfigPath(): string {
  const explicitPath = process.env.COMPOSE_CONFIG_PATH;

  if (explicitPath !== undefined && explicitPath.trim().length > 0) {
    return resolve(explicitPath);
  }

  if (platform() === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'compose', 'config.json');
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  const configHome = xdgConfigHome === undefined || xdgConfigHome.trim().length === 0 ? join(homedir(), '.config') : xdgConfigHome;
  return join(configHome, 'compose', 'config.json');
}

export function normalizeWorkspaceConfig(value: unknown): WorkspaceConfig {
  if (!isObject(value)) {
    return createEmptyWorkspaceConfig();
  }

  const workspaces = normalizeWorkspaceDefinitions(value.workspaces);
  const currentWorkspaceName = typeof value.currentWorkspaceName === 'string' && value.currentWorkspaceName in workspaces
    ? value.currentWorkspaceName
    : undefined;
  const config: WorkspaceConfig = {
    version: workspaceConfigVersion,
    workspaces,
    favoriteStacks: normalizeFavoriteStacks(value.favoriteStacks),
    recentStacks: normalizeRecentStacks(value.recentStacks),
  };

  return currentWorkspaceName === undefined ? config : { ...config, currentWorkspaceName };
}

export function addWorkspace(config: WorkspaceConfig, name: string, workspacePath: string, now = new Date()): WorkspaceConfig {
  const normalizedName = normalizeWorkspaceName(name);
  const currentWorkspace = config.workspaces[normalizedName];
  const timestamp = now.toISOString();
  const workspace: WorkspaceDefinition = {
    name: normalizedName,
    path: resolve(workspacePath),
    createdAt: currentWorkspace?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  return {
    ...config,
    currentWorkspaceName: config.currentWorkspaceName ?? normalizedName,
    workspaces: {
      ...config.workspaces,
      [normalizedName]: workspace,
    },
  };
}

export function removeWorkspace(config: WorkspaceConfig, name: string): WorkspaceConfig {
  const normalizedName = normalizeWorkspaceName(name);

  if (!(normalizedName in config.workspaces)) {
    throw new Error(`Unknown workspace: ${normalizedName}`);
  }

  const { [normalizedName]: _removed, ...remainingWorkspaces } = config.workspaces;
  const favoriteStacks = config.favoriteStacks.filter((favorite) => favorite.workspaceName !== normalizedName);
  const recentStacks = config.recentStacks.filter((recent) => recent.workspaceName !== normalizedName);
  const nextConfig: WorkspaceConfig = {
    version: config.version,
    workspaces: remainingWorkspaces,
    favoriteStacks,
    recentStacks,
  };

  if (config.currentWorkspaceName !== normalizedName && config.currentWorkspaceName !== undefined) {
    return { ...nextConfig, currentWorkspaceName: config.currentWorkspaceName };
  }

  const nextWorkspaceName = Object.keys(remainingWorkspaces).sort()[0];
  return nextWorkspaceName === undefined ? nextConfig : { ...nextConfig, currentWorkspaceName: nextWorkspaceName };
}

export function useWorkspace(config: WorkspaceConfig, name: string): WorkspaceConfig {
  const normalizedName = normalizeWorkspaceName(name);

  if (!(normalizedName in config.workspaces)) {
    throw new Error(`Unknown workspace: ${normalizedName}`);
  }

  return {
    ...config,
    currentWorkspaceName: normalizedName,
  };
}

export function getCurrentWorkspace(config: WorkspaceConfig): WorkspaceDefinition | undefined {
  const currentWorkspaceName = config.currentWorkspaceName;
  return currentWorkspaceName === undefined ? undefined : config.workspaces[currentWorkspaceName];
}

export function createFavoriteStack(workspaceName: string, project: DiscoveredComposeProject, now = new Date()): FavoriteStack {
  return {
    workspaceName: normalizeWorkspaceName(workspaceName),
    stackId: project.id,
    stackName: project.name,
    relativePath: project.relativePath,
    composeFilePath: project.composeFilePath,
    createdAt: now.toISOString(),
  };
}

export function addFavoriteStack(config: WorkspaceConfig, workspaceName: string, project: DiscoveredComposeProject, now = new Date()): WorkspaceConfig {
  const normalizedWorkspaceName = normalizeWorkspaceName(workspaceName);
  const favorite = createFavoriteStack(normalizedWorkspaceName, project, now);
  const favoriteStacks = [
    ...config.favoriteStacks.filter((entry) => !isSameFavorite(entry, normalizedWorkspaceName, project.relativePath)),
    favorite,
  ].sort(compareFavoriteStacks);

  return {
    ...config,
    favoriteStacks,
  };
}

export function removeFavoriteStack(config: WorkspaceConfig, workspaceName: string, projectOrStack: DiscoveredComposeProject | string): WorkspaceConfig {
  const normalizedWorkspaceName = normalizeWorkspaceName(workspaceName);
  const stackKey = typeof projectOrStack === 'string' ? projectOrStack : projectOrStack.relativePath;

  return {
    ...config,
    favoriteStacks: config.favoriteStacks.filter((entry) => !matchesFavoriteKey(entry, normalizedWorkspaceName, stackKey)),
  };
}

export function isFavoriteStack(config: WorkspaceConfig, workspaceName: string, project: DiscoveredComposeProject): boolean {
  const normalizedWorkspaceName = normalizeWorkspaceName(workspaceName);
  return config.favoriteStacks.some((entry) => isSameFavorite(entry, normalizedWorkspaceName, project.relativePath));
}

export function getFavoriteStackIds(config: WorkspaceConfig, workspaceName: string): string[] {
  const normalizedWorkspaceName = normalizeWorkspaceName(workspaceName);
  return config.favoriteStacks
    .filter((entry) => entry.workspaceName === normalizedWorkspaceName)
    .map((entry) => entry.relativePath)
    .sort();
}

export function recordRecentStack(config: WorkspaceConfig, workspaceName: string, project: DiscoveredComposeProject, now = new Date()): WorkspaceConfig {
  const normalizedWorkspaceName = normalizeWorkspaceName(workspaceName);
  const recent: RecentStack = {
    workspaceName: normalizedWorkspaceName,
    stackId: project.id,
    stackName: project.name,
    relativePath: project.relativePath,
    composeFilePath: project.composeFilePath,
    usedAt: now.toISOString(),
  };
  const recentStacks = [
    recent,
    ...config.recentStacks.filter((entry) => !matchesFavoriteKey(entry, normalizedWorkspaceName, project.relativePath)),
  ].slice(0, maxRecentStacks);

  return {
    ...config,
    recentStacks,
  };
}

export function normalizeWorkspaceName(name: string): string {
  const normalizedName = name.trim();

  if (normalizedName.length === 0) {
    throw new Error('Workspace name cannot be empty.');
  }

  return normalizedName;
}

function normalizeWorkspaceDefinitions(value: unknown): Record<string, WorkspaceDefinition> {
  if (!isObject(value)) {
    return {};
  }

  const entries = Object.entries(value)
    .filter((entry): entry is [string, WorkspaceDefinition] => isWorkspaceDefinition(entry[1]))
    .map(([name, workspace]) => [name, workspace] as const);

  return Object.fromEntries(entries);
}

function normalizeFavoriteStacks(value: unknown): FavoriteStack[] {
  return Array.isArray(value) ? value.filter(isFavoriteStackValue).sort(compareFavoriteStacks) : [];
}

function normalizeRecentStacks(value: unknown): RecentStack[] {
  return Array.isArray(value) ? value.filter(isRecentStackValue).slice(0, maxRecentStacks) : [];
}

function isWorkspaceDefinition(value: unknown): value is WorkspaceDefinition {
  return isObject(value)
    && typeof value.name === 'string'
    && typeof value.path === 'string'
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string';
}

function isFavoriteStackValue(value: unknown): value is FavoriteStack {
  return isObject(value)
    && typeof value.workspaceName === 'string'
    && typeof value.stackId === 'string'
    && typeof value.stackName === 'string'
    && typeof value.relativePath === 'string'
    && typeof value.composeFilePath === 'string'
    && typeof value.createdAt === 'string';
}

function isRecentStackValue(value: unknown): value is RecentStack {
  return isObject(value)
    && typeof value.workspaceName === 'string'
    && typeof value.stackId === 'string'
    && typeof value.stackName === 'string'
    && typeof value.relativePath === 'string'
    && typeof value.composeFilePath === 'string'
    && typeof value.usedAt === 'string';
}

function isSameFavorite(entry: Pick<FavoriteStack, 'workspaceName' | 'relativePath'>, workspaceName: string, relativePath: string): boolean {
  return entry.workspaceName === workspaceName && entry.relativePath === relativePath;
}

function matchesFavoriteKey(entry: Pick<FavoriteStack, 'workspaceName' | 'relativePath' | 'stackName'>, workspaceName: string, stackKey: string): boolean {
  return entry.workspaceName === workspaceName && (entry.relativePath === stackKey || entry.stackName === stackKey || entry.composeFilePath === stackKey);
}

function compareFavoriteStacks(left: FavoriteStack, right: FavoriteStack): number {
  return left.workspaceName.localeCompare(right.workspaceName) || left.stackName.localeCompare(right.stackName) || left.relativePath.localeCompare(right.relativePath);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
