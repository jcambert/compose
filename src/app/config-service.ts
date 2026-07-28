import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  createEmptyWorkspaceConfig,
  workspaceConfigVersion,
} from '../workspace/workspace-config.js';
import type { FavoriteStack, RecentStack, WorkspaceConfig, WorkspaceDefinition } from '../workspace/workspace-config.js';
import { createWorkspaceStore } from '../workspace/workspace-store.js';
import type { WorkspaceStore } from '../workspace/workspace-store.js';

export type ConfigApplicationDependencies = {
  workspaceStore?: WorkspaceStore;
  readTextFile?: (filePath: string) => Promise<string>;
};

export type ConfigPathResult = {
  path: string;
};

export type ConfigExportResult = {
  path: string;
  config: WorkspaceConfig;
  content: string;
};

export type ConfigImportInput = {
  filePath: string;
};

export type ConfigImportResult = {
  path: string;
  importedFrom: string;
  config: WorkspaceConfig;
  workspaceCount: number;
  favoriteCount: number;
  recentCount: number;
};

export type ConfigResetResult = {
  path: string;
  config: WorkspaceConfig;
};

export function getConfigPath(dependencies: ConfigApplicationDependencies = {}): ConfigPathResult {
  return { path: resolveWorkspaceStore(dependencies).configPath };
}

export async function exportConfig(dependencies: ConfigApplicationDependencies = {}): Promise<ConfigExportResult> {
  const store = resolveWorkspaceStore(dependencies);
  const config = await store.load();

  return {
    path: store.configPath,
    config,
    content: formatWorkspaceConfig(config),
  };
}

export async function importConfigFile(
  input: ConfigImportInput,
  dependencies: ConfigApplicationDependencies = {},
): Promise<ConfigImportResult> {
  const store = resolveWorkspaceStore(dependencies);
  const importedFrom = resolve(input.filePath);
  const readTextFile = dependencies.readTextFile ?? readFileAsText;
  const content = await readTextFile(importedFrom);
  const config = parseImportedWorkspaceConfig(content, importedFrom);
  await store.save(config);

  return {
    path: store.configPath,
    importedFrom,
    config,
    workspaceCount: Object.keys(config.workspaces).length,
    favoriteCount: config.favoriteStacks.length,
    recentCount: config.recentStacks.length,
  };
}

export async function resetConfig(dependencies: ConfigApplicationDependencies = {}): Promise<ConfigResetResult> {
  const store = resolveWorkspaceStore(dependencies);
  const config = createEmptyWorkspaceConfig();
  await store.save(config);

  return {
    path: store.configPath,
    config,
  };
}

export function parseImportedWorkspaceConfig(content: string, sourceName = 'config file'): WorkspaceConfig {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(content);
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Invalid JSON.';
    throw new Error(`Invalid compose config in ${sourceName}: ${details}`);
  }

  return validateImportedWorkspaceConfig(parsedValue, sourceName);
}

export function validateImportedWorkspaceConfig(value: unknown, sourceName = 'config file'): WorkspaceConfig {
  const errors: string[] = [];

  if (!isObject(value)) {
    throw new Error(`Invalid compose config in ${sourceName}: root value must be an object.`);
  }

  if (value.version !== workspaceConfigVersion) {
    errors.push(`version must be ${workspaceConfigVersion}`);
  }

  const workspaces = parseWorkspaceDefinitions(value.workspaces, errors);
  const favoriteStacks = parseFavoriteStacks(value.favoriteStacks, errors);
  const recentStacks = parseRecentStacks(value.recentStacks, errors);
  const currentWorkspaceName = parseCurrentWorkspaceName(value.currentWorkspaceName, workspaces, errors);

  validateWorkspaceReferences('favoriteStacks', favoriteStacks, workspaces, errors);
  validateWorkspaceReferences('recentStacks', recentStacks, workspaces, errors);

  if (errors.length > 0) {
    throw new Error(`Invalid compose config in ${sourceName}: ${errors.join('; ')}.`);
  }

  const config: WorkspaceConfig = {
    version: workspaceConfigVersion,
    workspaces,
    favoriteStacks,
    recentStacks,
  };

  return currentWorkspaceName === undefined ? config : { ...config, currentWorkspaceName };
}

export function formatWorkspaceConfig(config: WorkspaceConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

async function readFileAsText(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8');
}

function resolveWorkspaceStore(dependencies: ConfigApplicationDependencies): WorkspaceStore {
  return dependencies.workspaceStore ?? createWorkspaceStore();
}

function parseWorkspaceDefinitions(value: unknown, errors: string[]): Record<string, WorkspaceDefinition> {
  if (!isObject(value)) {
    errors.push('workspaces must be an object');
    return {};
  }

  const workspaces: Record<string, WorkspaceDefinition> = {};

  for (const [name, workspace] of Object.entries(value)) {
    if (!isWorkspaceDefinition(workspace)) {
      errors.push(`workspaces.${name} is invalid`);
      continue;
    }

    if (workspace.name !== name) {
      errors.push(`workspaces.${name}.name must match its key`);
      continue;
    }

    workspaces[name] = workspace;
  }

  return workspaces;
}

function parseFavoriteStacks(value: unknown, errors: string[]): FavoriteStack[] {
  if (!Array.isArray(value)) {
    errors.push('favoriteStacks must be an array');
    return [];
  }

  const favoriteStacks: FavoriteStack[] = [];

  value.forEach((favorite, index) => {
    if (!isFavoriteStack(favorite)) {
      errors.push(`favoriteStacks[${index}] is invalid`);
      return;
    }

    favoriteStacks.push(favorite);
  });

  return favoriteStacks;
}

function parseRecentStacks(value: unknown, errors: string[]): RecentStack[] {
  if (!Array.isArray(value)) {
    errors.push('recentStacks must be an array');
    return [];
  }

  const recentStacks: RecentStack[] = [];

  value.forEach((recent, index) => {
    if (!isRecentStack(recent)) {
      errors.push(`recentStacks[${index}] is invalid`);
      return;
    }

    recentStacks.push(recent);
  });

  return recentStacks;
}

function parseCurrentWorkspaceName(
  value: unknown,
  workspaces: Record<string, WorkspaceDefinition>,
  errors: string[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    errors.push('currentWorkspaceName must be a string when provided');
    return undefined;
  }

  if (workspaces[value] === undefined) {
    errors.push(`currentWorkspaceName references unknown workspace ${value}`);
  }

  return value;
}

function validateWorkspaceReferences(
  propertyName: 'favoriteStacks' | 'recentStacks',
  entries: Array<FavoriteStack | RecentStack>,
  workspaces: Record<string, WorkspaceDefinition>,
  errors: string[],
): void {
  entries.forEach((entry, index) => {
    if (workspaces[entry.workspaceName] === undefined) {
      errors.push(`${propertyName}[${index}].workspaceName references unknown workspace ${entry.workspaceName}`);
    }
  });
}

function isWorkspaceDefinition(value: unknown): value is WorkspaceDefinition {
  return isObject(value)
    && typeof value.name === 'string'
    && value.name.length > 0
    && typeof value.path === 'string'
    && value.path.length > 0
    && typeof value.createdAt === 'string'
    && value.createdAt.length > 0
    && typeof value.updatedAt === 'string'
    && value.updatedAt.length > 0;
}

function isFavoriteStack(value: unknown): value is FavoriteStack {
  return isObject(value)
    && typeof value.workspaceName === 'string'
    && value.workspaceName.length > 0
    && typeof value.stackId === 'string'
    && value.stackId.length > 0
    && typeof value.stackName === 'string'
    && value.stackName.length > 0
    && typeof value.relativePath === 'string'
    && value.relativePath.length > 0
    && typeof value.composeFilePath === 'string'
    && value.composeFilePath.length > 0
    && typeof value.createdAt === 'string'
    && value.createdAt.length > 0;
}

function isRecentStack(value: unknown): value is RecentStack {
  return isObject(value)
    && typeof value.workspaceName === 'string'
    && value.workspaceName.length > 0
    && typeof value.stackId === 'string'
    && value.stackId.length > 0
    && typeof value.stackName === 'string'
    && value.stackName.length > 0
    && typeof value.relativePath === 'string'
    && value.relativePath.length > 0
    && typeof value.composeFilePath === 'string'
    && value.composeFilePath.length > 0
    && typeof value.usedAt === 'string'
    && value.usedAt.length > 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
