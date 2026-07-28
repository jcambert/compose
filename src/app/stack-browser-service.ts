import { browseComposeStacks } from '../interactive/stack-browser.js';
import type { StackBrowserOptions, StackBrowserResult } from '../interactive/stack-browser.js';
import type { DiscoveredComposeProject } from '../scanner/discovered-project.js';
import {
  addFavoriteStack,
  createWorkspaceStore,
  getCurrentWorkspace,
  getFavoriteStackIds,
  recordRecentStack,
  removeFavoriteStack,
} from '../workspace/workspace-store.js';
import type { WorkspaceStore } from '../workspace/workspace-store.js';
import type { PromptAdapter } from '../guided/guided-command-resolver.js';

export type BrowseApplicationStacksInput = {
  root?: string;
  options?: StackBrowserOptions;
};

export type BrowseApplicationStacksDependencies = {
  prompts: PromptAdapter;
  workspaceStore?: WorkspaceStore;
  print?: (message: string) => void;
  warn?: (message: string) => void;
};

export async function browseApplicationStacks(
  input: BrowseApplicationStacksInput,
  dependencies: BrowseApplicationStacksDependencies,
): Promise<StackBrowserResult> {
  const store = dependencies.workspaceStore ?? createWorkspaceStore();
  const config = await store.load();
  const currentWorkspace = getCurrentWorkspace(config);
  const useCurrentWorkspace = input.root === undefined && currentWorkspace !== undefined;
  const workspaceName = useCurrentWorkspace ? config.currentWorkspaceName : undefined;
  const resolvedRoot = input.root ?? currentWorkspace?.path ?? '.';
  const favoriteStackIds = workspaceName === undefined ? [] : getFavoriteStackIds(config, workspaceName);
  const browserOptions: StackBrowserOptions = {
    ...(input.options ?? {}),
    ...(workspaceName === undefined ? {} : { workspaceName }),
    ...(favoriteStackIds.length === 0 ? {} : { favoriteStackIds }),
  };

  return browseComposeStacks(resolvedRoot, browserOptions, {
    prompts: dependencies.prompts,
    ...(dependencies.print === undefined ? {} : { print: dependencies.print }),
    ...(dependencies.warn === undefined ? {} : { warn: dependencies.warn }),
    async setFavorite(project, favorite) {
      await updateFavorite(store, workspaceName, project, favorite, dependencies.warn);
    },
    async recordRecent(project) {
      await recordRecent(store, workspaceName, project);
    },
  });
}

async function updateFavorite(
  store: WorkspaceStore,
  workspaceName: string | undefined,
  project: DiscoveredComposeProject,
  favorite: boolean,
  warn: ((message: string) => void) | undefined,
): Promise<void> {
  if (workspaceName === undefined) {
    warn?.('Favorites require a current workspace. Use compose workspace add <name> <path> first.');
    return;
  }

  const latestConfig = await store.load();
  const nextConfig = favorite
    ? addFavoriteStack(latestConfig, workspaceName, project)
    : removeFavoriteStack(latestConfig, workspaceName, project);
  await store.save(nextConfig);
}

async function recordRecent(
  store: WorkspaceStore,
  workspaceName: string | undefined,
  project: DiscoveredComposeProject,
): Promise<void> {
  if (workspaceName === undefined) {
    return;
  }

  const latestConfig = await store.load();
  await store.save(recordRecentStack(latestConfig, workspaceName, project));
}
