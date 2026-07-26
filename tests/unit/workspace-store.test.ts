import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DiscoveredComposeProject } from '../../src/scanner/discovered-project.js';
import { createEmptyWorkspaceConfig } from '../../src/workspace/workspace-config.js';
import {
  addFavoriteStack,
  addWorkspace,
  createWorkspaceStore,
  getCurrentWorkspace,
  getFavoriteStackIds,
  recordRecentStack,
  removeFavoriteStack,
  removeWorkspace,
  useWorkspace,
} from '../../src/workspace/workspace-store.js';

function createProject(overrides: Partial<DiscoveredComposeProject> = {}): DiscoveredComposeProject {
  return {
    id: 'stack-1',
    name: 'infra',
    composeFilePath: '/workspace/infra/compose.yaml',
    directoryPath: '/workspace/infra',
    relativePath: 'infra/compose.yaml',
    services: ['api'],
    warnings: [],
    ...overrides,
  };
}

describe('workspace store', () => {
  it('adds, uses and removes named workspaces', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const config = addWorkspace(createEmptyWorkspaceConfig(), 'dev', '/workspace', now);

    expect(config.currentWorkspaceName).toBe('dev');
    expect(config.workspaces.dev).toMatchObject({ name: 'dev', path: '/workspace' });
    expect(getCurrentWorkspace(config)?.name).toBe('dev');

    const withSecondWorkspace = addWorkspace(config, 'ops', '/ops', now);
    const currentOps = useWorkspace(withSecondWorkspace, 'ops');
    expect(getCurrentWorkspace(currentOps)?.path).toBe('/ops');

    const afterRemove = removeWorkspace(currentOps, 'ops');
    expect(afterRemove.currentWorkspaceName).toBe('dev');
    expect(afterRemove.workspaces.ops).toBeUndefined();
  });

  it('adds, removes and lists favorite stacks by workspace', () => {
    const project = createProject();
    const baseConfig = addWorkspace(createEmptyWorkspaceConfig(), 'dev', '/workspace', new Date('2026-01-01T00:00:00.000Z'));
    const withFavorite = addFavoriteStack(baseConfig, 'dev', project, new Date('2026-01-01T00:00:00.000Z'));

    expect(getFavoriteStackIds(withFavorite, 'dev')).toEqual(['infra/compose.yaml']);
    expect(withFavorite.favoriteStacks[0]).toMatchObject({ workspaceName: 'dev', stackName: 'infra' });

    const withoutFavorite = removeFavoriteStack(withFavorite, 'dev', project);
    expect(getFavoriteStackIds(withoutFavorite, 'dev')).toEqual([]);
  });

  it('records recent stacks without duplicating the same stack', () => {
    const project = createProject();
    const baseConfig = addWorkspace(createEmptyWorkspaceConfig(), 'dev', '/workspace', new Date('2026-01-01T00:00:00.000Z'));
    const firstRecord = recordRecentStack(baseConfig, 'dev', project, new Date('2026-01-01T00:00:00.000Z'));
    const secondRecord = recordRecentStack(firstRecord, 'dev', project, new Date('2026-01-02T00:00:00.000Z'));

    expect(secondRecord.recentStacks).toHaveLength(1);
    expect(secondRecord.recentStacks[0]).toMatchObject({ relativePath: 'infra/compose.yaml', usedAt: '2026-01-02T00:00:00.000Z' });
  });

  it('persists config JSON to a local user config path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'compose-workspace-'));
    const store = createWorkspaceStore(join(directory, 'config.json'));
    const config = addWorkspace(createEmptyWorkspaceConfig(), 'dev', '/workspace', new Date('2026-01-01T00:00:00.000Z'));

    await store.save(config);
    const loaded = await store.load();

    expect(loaded).toEqual(config);
  });
});
