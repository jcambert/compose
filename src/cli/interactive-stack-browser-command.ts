import type { Command } from 'commander';
import { browseComposeStacks } from '../interactive/stack-browser.js';
import type { StackBrowserOptions } from '../interactive/stack-browser.js';
import {
  addFavoriteStack,
  createWorkspaceStore,
  getCurrentWorkspace,
  getFavoriteStackIds,
  recordRecentStack,
  removeFavoriteStack,
} from '../workspace/workspace-store.js';
import { inquirerPromptAdapter } from './inquirer-prompt-adapter.js';

export function registerInteractiveStackBrowserCommand(program: Command): void {
  program
    .command('browse')
    .alias('stacks')
    .description('Scan and browse Compose stacks, services and actions interactively.')
    .argument('[root]', 'root directory to scan')
    .option('--max-depth <depth>', 'maximum recursive scan depth', parseInteger)
    .option('--project-name <name>', 'Docker Compose project name')
    .option('--profile <profile...>', 'Compose profile')
    .option('--dry-run', 'print generated docker compose commands without executing them')
    .option('--no-ansi', 'disable ANSI output from docker compose')
    .action(async (root: string | undefined, options: StackBrowserCliOptions) => {
      const store = createWorkspaceStore();
      const config = await store.load();
      const currentWorkspace = getCurrentWorkspace(config);
      const useCurrentWorkspace = root === undefined && currentWorkspace !== undefined;
      const workspaceName = useCurrentWorkspace ? config.currentWorkspaceName : undefined;
      const resolvedRoot = root ?? currentWorkspace?.path ?? '.';
      const browserOptions = createStackBrowserOptions(options, workspaceName, workspaceName === undefined ? [] : getFavoriteStackIds(config, workspaceName));
      const result = await browseComposeStacks(resolvedRoot, browserOptions, {
        prompts: inquirerPromptAdapter,
        async setFavorite(project, favorite) {
          if (workspaceName === undefined) {
            console.warn('Favorites require a current workspace. Use compose workspace add <name> <path> first.');
            return;
          }

          const latestConfig = await store.load();
          const nextConfig = favorite
            ? addFavoriteStack(latestConfig, workspaceName, project)
            : removeFavoriteStack(latestConfig, workspaceName, project);
          await store.save(nextConfig);
        },
        async recordRecent(project) {
          if (workspaceName === undefined) {
            return;
          }

          const latestConfig = await store.load();
          await store.save(recordRecentStack(latestConfig, workspaceName, project));
        },
      });

      if (result.lastExitCode !== undefined && result.lastExitCode !== 0) {
        process.exitCode = result.lastExitCode;
      }
    });
}

function createStackBrowserOptions(
  options: StackBrowserCliOptions,
  workspaceName: string | undefined,
  favoriteStackIds: string[],
): StackBrowserOptions {
  return {
    ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
    ...(options.projectName === undefined ? {} : { projectName: options.projectName }),
    ...(options.profile === undefined ? {} : { profile: options.profile }),
    ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
    ...(options.noAnsi === undefined ? {} : { noAnsi: options.noAnsi }),
    ...(workspaceName === undefined ? {} : { workspaceName }),
    ...(favoriteStackIds.length === 0 ? {} : { favoriteStackIds }),
  };
}

function parseInteger(value: string): number {
  const parsedValue = Number.parseInt(value, 10);

  if (Number.isNaN(parsedValue)) {
    throw new Error(`Invalid integer: ${value}`);
  }

  return parsedValue;
}

type StackBrowserCliOptions = {
  maxDepth?: number;
  projectName?: string;
  profile?: string[];
  dryRun?: boolean;
  noAnsi?: boolean;
};
