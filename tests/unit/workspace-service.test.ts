import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addFavoriteByStackReference,
  addWorkspaceEntry,
  getCurrentWorkspaceEntry,
  listFavoriteEntries,
  listWorkspaceEntries,
  removeFavoriteByStackReference,
  removeWorkspaceEntry,
  setCurrentWorkspace,
} from '../../src/app/workspace-service.js';
import type { WorkspaceApplicationDependencies } from '../../src/app/workspace-service.js';
import type { DiscoveredComposeProject } from '../../src/scanner/discovered-project.js';
import { createWorkspaceStore } from '../../src/workspace/workspace-store.js';

const project: DiscoveredComposeProject = {
  id: 'infra-compose-yaml',
  name: 'infra',
  composeFilePath: '/workspace/infra/compose.yaml',
  directoryPath: '/workspace/infra',
  relativePath: 'infra/compose.yaml',
  services: ['api'],
  warnings: [],
};

async function createDependencies(): Promise<WorkspaceApplicationDependencies> {
  const root = await mkdtemp(join(tmpdir(), 'compose-workspace-service-'));
  return {
    workspaceStore: createWorkspaceStore(join(root, 'config.json')),
    scanWorkspaceProjects: async () => [project],
  };
}

describe('workspace application service', () => {
  it('adds, lists, switches and removes workspaces through the application boundary', async () => {
    const dependencies = await createDependencies();
    const workspacePath = join(tmpdir(), 'compose-workspace-root');

    const saved = await addWorkspaceEntry({ name: 'dev', path: workspacePath }, dependencies);
    const listed = await listWorkspaceEntries(dependencies);
    const current = await getCurrentWorkspaceEntry(dependencies);
    const selected = await setCurrentWorkspace({ name: 'dev' }, dependencies);
    const removedName = await removeWorkspaceEntry({ name: 'dev' }, dependencies);

    expect(saved.name).toBe('dev');
    expect(listed.workspaces.map((workspace) => workspace.name)).toEqual(['dev']);
    expect(listed.currentWorkspaceName).toBe('dev');
    expect(current?.name).toBe('dev');
    expect(selected.name).toBe('dev');
    expect(removedName).toBe('dev');
  });

  it('adds, lists and removes favorites by resolving a stack from the workspace', async () => {
    const dependencies = await createDependencies();
    await addWorkspaceEntry({ name: 'dev', path: '/workspace' }, dependencies);

    const favorite = await addFavoriteByStackReference({ stack: 'infra' }, dependencies);
    const listed = await listFavoriteEntries({}, dependencies);
    const removed = await removeFavoriteByStackReference({ stack: 'infra' }, dependencies);
    const listedAfterRemoval = await listFavoriteEntries({}, dependencies);

    expect(favorite.stackName).toBe('infra');
    expect(favorite.relativePath).toBe('infra/compose.yaml');
    expect(listed.workspace.name).toBe('dev');
    expect(listed.favorites.map((entry) => entry.stackName)).toEqual(['infra']);
    expect(removed.stack).toBe('infra');
    expect(listedAfterRemoval.favorites).toEqual([]);
  });
});
