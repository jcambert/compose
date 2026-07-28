import type { Command } from 'commander';
import {
  addFavoriteByStackReference,
  addWorkspaceEntry,
  getCurrentWorkspaceEntry,
  listFavoriteEntries,
  listWorkspaceEntries,
  removeFavoriteByStackReference,
  removeWorkspaceEntry,
  setCurrentWorkspace,
} from '../app/workspace-service.js';
import type { FavoriteStack, WorkspaceDefinition } from '../workspace/workspace-config.js';

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
      const saved = await addWorkspaceEntry({ name, path: workspacePath });
      console.log(`Workspace ${saved.name} saved.`);
    });

  workspace
    .command('remove')
    .argument('<name>', 'workspace name')
    .action(async (name: string) => {
      const workspaceName = await removeWorkspaceEntry({ name });
      console.log(`Workspace ${workspaceName} removed.`);
    });

  workspace
    .command('use')
    .argument('<name>', 'workspace name')
    .action(async (name: string) => {
      const workspaceEntry = await setCurrentWorkspace({ name });
      console.log(`Current workspace: ${workspaceEntry.name}`);
    });

  workspace
    .command('list')
    .action(async () => {
      const result = await listWorkspaceEntries();

      if (result.workspaces.length === 0) {
        console.log('No workspaces configured.');
        return;
      }

      for (const entry of result.workspaces) {
        console.log(formatWorkspaceLine(entry, result.currentWorkspaceName));
      }
    });

  workspace
    .command('current')
    .action(async () => {
      const currentWorkspace = await getCurrentWorkspaceEntry();

      if (currentWorkspace === undefined) {
        console.log('No current workspace configured.');
        return;
      }

      console.log(formatWorkspaceLine(currentWorkspace, currentWorkspace.name));
    });
}

function registerFavoritesGroup(program: Command): void {
  const favorites = program.command('favorites').description('Manage favorite Compose stacks.');

  favorites
    .command('add')
    .argument('<stack>', 'stack name, relative Compose file path or Compose file path')
    .option('--workspace <name>', 'workspace name, defaults to current workspace')
    .action(async (stack: string, options: FavoriteCliOptions) => {
      const favorite = await addFavoriteByStackReference({ stack, ...(options.workspace === undefined ? {} : { workspaceName: options.workspace }) });
      console.log(`Favorite added: ${favorite.stackName} (${favorite.relativePath})`);
    });

  favorites
    .command('remove')
    .argument('<stack>', 'stack name, relative Compose file path or Compose file path')
    .option('--workspace <name>', 'workspace name, defaults to current workspace')
    .action(async (stack: string, options: FavoriteCliOptions) => {
      const result = await removeFavoriteByStackReference({ stack, ...(options.workspace === undefined ? {} : { workspaceName: options.workspace }) });
      console.log(`Favorite removed: ${result.stack}`);
    });

  favorites
    .command('list')
    .option('--workspace <name>', 'workspace name, defaults to current workspace')
    .action(async (options: FavoriteCliOptions) => {
      const result = await listFavoriteEntries(options.workspace === undefined ? {} : { workspaceName: options.workspace });

      if (result.favorites.length === 0) {
        console.log(`No favorites for workspace ${result.workspace.name}.`);
        return;
      }

      for (const favorite of result.favorites) {
        console.log(formatFavoriteLine(favorite));
      }
    });
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
