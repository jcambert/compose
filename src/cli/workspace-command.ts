import type { Command } from 'commander';
import { scanComposeFiles } from '../scanner/compose-file-scanner.js';
import type { DiscoveredComposeProject } from '../scanner/discovered-project.js';
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
import type { FavoriteStack, WorkspaceConfig, WorkspaceDefinition } from '../workspace/workspace-config.js';

export function registerWorkspaceCommands(program: Command): void {
  registerWorkspaceGroup(program);
  registerFavoritesGroup(program);
}

function registerWorkspaceGroup(program: Command): void {
  const workspace = program.command('workspace').description('Manage named scan roots.');

  workspace
    .command('add')
    .argument('<name>', 'workspace name')
    .argument('<path>', 'root directory to scan')
    .action(async (name: string, workspacePath: string) => {
      const store = createWorkspaceStore();
      const config = await store.load();
      const nextConfig = addWorkspace(config, name, workspacePath);
      await store.save(nextConfig);
      console.log(`Workspace ${normalizeWorkspaceName(name)} saved.`);
    });

  workspace
    .command('remove')
    .argument('<name>', 'workspace name')
    .action(async (name: string) => {
      const store = createWorkspaceStore();
      const config = await store.load();
      await store.save(removeWorkspace(config, name));
      console.log(`Workspace ${normalizeWorkspaceName(name)} removed.`);
    });

  workspace
    .command('use')
    .argument('<name>', 'workspace name')
    .action(async (name: string) => {
      const store = createWorkspaceStore();
      const config = await store.load();
      await store.save(useWorkspace(config, name));
      console.log(`Current workspace: ${normalizeWorkspaceName(name)}`);
    });

  workspace
    .command('list')
    .action(async () => {
      const store = createWorkspaceStore();
      const config = await store.load();
      const workspaces = Object.values(config.workspaces).sort((left, right) => left.name.localeCompare(right.name));

      if (workspaces.length === 0) {
        console.log('No workspaces configured.');
        return;
      }

      for (const entry of workspaces) {
        console.log(formatWorkspaceLine(entry, config.currentWorkspaceName));
      }
    });

  workspace
    .command('current')
    .action(async () => {
      const store = createWorkspaceStore();
      const config = await store.load();
      const currentWorkspace = getCurrentWorkspace(config);

      if (currentWorkspace === undefined) {
        console.log('No current workspace configured.');
        return;
      }

      console.log(formatWorkspaceLine(currentWorkspace, config.currentWorkspaceName));
    });
}

function registerFavoritesGroup(program: Command): void {
  const favorites = program.command('favorites').description('Manage favorite Compose stacks.');

  favorites
    .command('add')
    .argument('<stack>', 'stack name, relative Compose file path or Compose file path')
    .option('--workspace <name>', 'workspace name, defaults to current workspace')
    .action(async (stack: string, options: FavoriteCliOptions) => {
      const store = createWorkspaceStore();
      const config = await store.load();
      const workspace = resolveWorkspace(config, options.workspace);
      const project = await findProjectInWorkspace(workspace, stack);
      await store.save(addFavoriteStack(config, workspace.name, project));
      console.log(`Favorite added: ${project.name} (${project.relativePath})`);
    });

  favorites
    .command('remove')
    .argument('<stack>', 'stack name, relative Compose file path or Compose file path')
    .option('--workspace <name>', 'workspace name, defaults to current workspace')
    .action(async (stack: string, options: FavoriteCliOptions) => {
      const store = createWorkspaceStore();
      const config = await store.load();
      const workspace = resolveWorkspace(config, options.workspace);
      await store.save(removeFavoriteStack(config, workspace.name, stack));
      console.log(`Favorite removed: ${stack}`);
    });

  favorites
    .command('list')
    .option('--workspace <name>', 'workspace name, defaults to current workspace')
    .action(async (options: FavoriteCliOptions) => {
      const store = createWorkspaceStore();
      const config = await store.load();
      const workspace = resolveWorkspace(config, options.workspace);
      const favoritesForWorkspace = config.favoriteStacks
        .filter((favorite) => favorite.workspaceName === workspace.name)
        .sort((left, right) => left.stackName.localeCompare(right.stackName) || left.relativePath.localeCompare(right.relativePath));

      if (favoritesForWorkspace.length === 0) {
        console.log(`No favorites for workspace ${workspace.name}.`);
        return;
      }

      for (const favorite of favoritesForWorkspace) {
        console.log(formatFavoriteLine(favorite));
      }
    });
}

function resolveWorkspace(config: WorkspaceConfig, requestedWorkspaceName: string | undefined): WorkspaceDefinition {
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

async function findProjectInWorkspace(workspace: WorkspaceDefinition, stack: string): Promise<DiscoveredComposeProject> {
  const projects = await scanComposeFiles(workspace.path);
  const project = projects.find((candidate) => matchesStack(candidate, stack));

  if (project === undefined) {
    throw new Error(`Stack not found in workspace ${workspace.name}: ${stack}`);
  }

  return project;
}

function matchesStack(project: DiscoveredComposeProject, stack: string): boolean {
  return project.name === stack
    || project.id === stack
    || project.relativePath === stack
    || project.composeFilePath === stack;
}

function formatWorkspaceLine(workspace: WorkspaceDefinition, currentWorkspaceName: string | undefined): string {
  const marker = workspace.name === currentWorkspaceName ? '*' : ' ';
  return `${marker} ${workspace.name.padEnd(18)} ${workspace.path}`;
}

function formatFavoriteLine(favorite: FavoriteStack): string {
  return `★ ${favorite.stackName.padEnd(18)} ${favorite.relativePath}`;
}

type FavoriteCliOptions = {
  workspace?: string;
};
