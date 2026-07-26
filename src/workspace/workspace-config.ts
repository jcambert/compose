export const workspaceConfigVersion = 1 as const;

export type WorkspaceDefinition = {
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type FavoriteStack = {
  workspaceName: string;
  stackId: string;
  stackName: string;
  relativePath: string;
  composeFilePath: string;
  createdAt: string;
};

export type RecentStack = {
  workspaceName: string;
  stackId: string;
  stackName: string;
  relativePath: string;
  composeFilePath: string;
  usedAt: string;
};

export type WorkspaceConfig = {
  version: typeof workspaceConfigVersion;
  currentWorkspaceName?: string;
  workspaces: Record<string, WorkspaceDefinition>;
  favoriteStacks: FavoriteStack[];
  recentStacks: RecentStack[];
};

export function createEmptyWorkspaceConfig(): WorkspaceConfig {
  return {
    version: workspaceConfigVersion,
    workspaces: {},
    favoriteStacks: [],
    recentStacks: [],
  };
}
