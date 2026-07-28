import { scanComposeFiles } from '../scanner/compose-file-scanner.js';
import type { DiscoveredComposeProject } from '../scanner/discovered-project.js';
import type { FavoriteStack, WorkspaceConfig, WorkspaceDefinition } from '../workspace/workspace-config.js';
import {
  addFavoriteStack,
  addWorkspace,
  createWorkspaceStore,
  getCurrentWorkspace,
  normalizeWorkspaceName,
  removeFavoriteStack,
  removeWorkspace,
  useWorkspace,
} from '../workspace/workspace-store.js';
import type { WorkspaceStore } from '../workspace/workspace-store.js';

export type WorkspaceApplicationDependencies = {
  workspaceStore?: WorkspaceStore;
  scanWorkspaceProjects?: (root: string) => Promise<DiscoveredComposeProject[]>;
};

export type WorkspaceMutationInput = {
  name: string;
  path: string;
};

export type WorkspaceNameInput = {
  name: string;
};

export type FavoriteStackInput = {
  stack: string;
  workspaceName?: string;
};

export type WorkspaceListResult = {
  workspaces: WorkspaceDefinition[];
  currentWorkspaceName?: string;
};

export type FavoriteListResult = {
  workspace: WorkspaceDefinition;
  favorites: FavoriteStack[];
};

export type FavoriteRemovalResult = {
  workspace: WorkspaceDefinition;
  stack: string;
};

export async function addWorkspaceEntry(
  input: WorkspaceMutationInput,
  dependencies: WorkspaceApplicationDependencies = {},
): Promise<WorkspaceDefinition> {
  const store = resolveWorkspaceStore(dependencies);
  const config = await store.load();
  const nextConfig = addWorkspace(config, input.name, input.path);
  await store.save(nextConfig);

  const workspace = nextConfig.workspaces[normalizeWorkspaceName(input.name)];

  if (workspace === undefined) {
    throw new Error(`Workspace was not saved: ${input.name}`);
  }

  return workspace;
}

export async function removeWorkspaceEntry(
  input: WorkspaceNameInput,
  dependencies: WorkspaceApplicationDependencies = {},
): Promise<string> {
  const store = resolveWorkspaceStore(dependencies);
  const config = await store.load();
  const workspaceName = normalizeWorkspaceName(input.name);
  await store.save(removeWorkspace(config, workspaceName));

  return workspaceName;
}

export async function setCurrentWorkspace(
  input: WorkspaceNameInput,
  dependencies: WorkspaceApplicationDependencies = {},
): Promise<WorkspaceDefinition> {
  const store = resolveWorkspaceStore(dependencies);
  const config = await store.load();
  const workspaceName = normalizeWorkspaceName(input.name);
  const nextConfig = useWorkspace(config, workspaceName);
  await store.save(nextConfig);

  const workspace = nextConfig.workspaces[workspaceName];

  if (workspace === undefined) {
    throw new Error(`Unknown workspace: ${workspaceName}`);
  }

  return workspace;
}

export async function listWorkspaceEntries(dependencies: WorkspaceApplicationDependencies = {}): Promise<WorkspaceListResult> {
  const config = await resolveWorkspaceStore(dependencies).load();
  const workspaces = Object.values(config.workspaces).sort((left, right) => left.name.localeCompare(right.name));

  return {
    workspaces,
    ...(config.currentWorkspaceName === undefined ? {} : { currentWorkspaceName: config.currentWorkspaceName }),
  };
}

export async function getCurrentWorkspaceEntry(
  dependencies: WorkspaceApplicationDependencies = {},
): Promise<WorkspaceDefinition | undefined> {
  return getCurrentWorkspace(await resolveWorkspaceStore(dependencies).load());
}

export async function addFavoriteByStackReference(
  input: FavoriteStackInput,
  dependencies: WorkspaceApplicationDependencies = {},
): Promise<FavoriteStack> {
  const store = resolveWorkspaceStore(dependencies);
  const config = await store.load();
  const workspace = resolveWorkspace(config, input.workspaceName);
  const project = await findProjectInWorkspace(workspace, input.stack, dependencies);
  const nextConfig = addFavoriteStack(config, workspace.name, project);
  await store.save(nextConfig);

  const favorite = nextConfig.favoriteStacks.find((entry) => entry.workspaceName === workspace.name && entry.relativePath === project.relativePath);

  if (favorite === undefined) {
    throw new Error(`Favorite was not saved: ${input.stack}`);
  }

  return favorite;
}

export async function removeFavoriteByStackReference(
  input: FavoriteStackInput,
  dependencies: WorkspaceApplicationDependencies = {},
): Promise<FavoriteRemovalResult> {
  const store = resolveWorkspaceStore(dependencies);
  const config = await store.load();
  const workspace = resolveWorkspace(config, input.workspaceName);
  await store.save(removeFavoriteStack(config, workspace.name, input.stack));

  return { workspace, stack: input.stack };
}

export async function listFavoriteEntries(
  input: { workspaceName?: string } = {},
  dependencies: WorkspaceApplicationDependencies = {},
): Promise<FavoriteListResult> {
  const config = await resolveWorkspaceStore(dependencies).load();
  const workspace = resolveWorkspace(config, input.workspaceName);
  const favorites = config.favoriteStacks
    .filter((favorite) => favorite.workspaceName === workspace.name)
    .sort((left, right) => left.stackName.localeCompare(right.stackName) || left.relativePath.localeCompare(right.relativePath));

  return { workspace, favorites };
}

export function resolveWorkspace(config: WorkspaceConfig, requestedWorkspaceName: string | undefined): WorkspaceDefinition {
  const workspaceName = requestedWorkspaceName === undefined ? config.currentWorkspaceName : normalizeWorkspaceName(requestedWorkspaceName);

  if (workspaceName === undefined) {
    throw new Error('No current workspace configured. Use compose workspace add <name> <path> first.');
  }

  const workspace = config.workspaces[workspaceName];

  if (workspace === undefined) {
    throw new Error(`Unknown workspace: ${workspaceName}`);
  }

  return workspace;
}

export async function findProjectInWorkspace(
  workspace: WorkspaceDefinition,
  stack: string,
  dependencies: WorkspaceApplicationDependencies = {},
): Promise<DiscoveredComposeProject> {
  const scan = dependencies.scanWorkspaceProjects ?? scanWorkspaceProjects;
  const projects = await scan(workspace.path);
  const project = projects.find((candidate) => matchesStack(candidate, stack));

  if (project === undefined) {
    throw new Error(`Stack not found in workspace ${workspace.name}: ${stack}`);
  }

  return project;
}

export function matchesStack(project: DiscoveredComposeProject, stack: string): boolean {
  return project.name === stack
    || project.id === stack
    || project.relativePath === stack
    || project.composeFilePath === stack;
}

function resolveWorkspaceStore(dependencies: WorkspaceApplicationDependencies): WorkspaceStore {
  return dependencies.workspaceStore ?? createWorkspaceStore();
}

async function scanWorkspaceProjects(root: string): Promise<DiscoveredComposeProject[]> {
  return scanComposeFiles(root);
}
