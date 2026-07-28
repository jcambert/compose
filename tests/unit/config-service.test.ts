import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  exportConfig,
  formatWorkspaceConfig,
  getConfigPath,
  importConfigFile,
  parseImportedWorkspaceConfig,
  resetConfig,
} from '../../src/app/config-service.js';
import type { ConfigApplicationDependencies } from '../../src/app/config-service.js';
import type { WorkspaceConfig } from '../../src/workspace/workspace-config.js';
import { createWorkspaceStore } from '../../src/workspace/workspace-store.js';

async function createDependencies(): Promise<ConfigApplicationDependencies> {
  const root = await mkdtemp(join(tmpdir(), 'compose-config-service-'));
  return {
    workspaceStore: createWorkspaceStore(join(root, 'config.json')),
  };
}

function createValidConfig(): WorkspaceConfig {
  return {
    version: 1,
    currentWorkspaceName: 'dev',
    workspaces: {
      dev: {
        name: 'dev',
        path: '/workspace',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
    favoriteStacks: [
      {
        workspaceName: 'dev',
        stackId: 'infra-compose-yaml',
        stackName: 'infra',
        relativePath: 'infra/compose.yaml',
        composeFilePath: '/workspace/infra/compose.yaml',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    recentStacks: [
      {
        workspaceName: 'dev',
        stackId: 'infra-compose-yaml',
        stackName: 'infra',
        relativePath: 'infra/compose.yaml',
        composeFilePath: '/workspace/infra/compose.yaml',
        usedAt: '2026-01-02T00:00:00.000Z',
      },
    ],
  };
}

describe('config application service', () => {
  it('returns the config path and exports normalized JSON content', async () => {
    const dependencies = await createDependencies();
    const config = createValidConfig();
    await dependencies.workspaceStore?.save(config);

    const pathResult = getConfigPath(dependencies);
    const exportResult = await exportConfig(dependencies);

    expect(pathResult.path.endsWith('config.json')).toBe(true);
    expect(exportResult.path).toBe(pathResult.path);
    expect(exportResult.config).toEqual(config);
    expect(JSON.parse(exportResult.content)).toEqual(config);
    expect(exportResult.content.endsWith('\n')).toBe(true);
  });

  it('imports a validated config file and returns import counts', async () => {
    const dependencies = await createDependencies();
    const backupRoot = await mkdtemp(join(tmpdir(), 'compose-config-backup-'));
    const backupPath = join(backupRoot, 'backup.json');
    const config = createValidConfig();
    await writeFile(backupPath, formatWorkspaceConfig(config), 'utf-8');

    const result = await importConfigFile({ filePath: backupPath }, dependencies);
    const exported = await exportConfig(dependencies);

    expect(result.importedFrom).toBe(backupPath);
    expect(result.workspaceCount).toBe(1);
    expect(result.favoriteCount).toBe(1);
    expect(result.recentCount).toBe(1);
    expect(exported.config).toEqual(config);
  });

  it('resets the current config to an empty config', async () => {
    const dependencies = await createDependencies();
    await dependencies.workspaceStore?.save(createValidConfig());

    const result = await resetConfig(dependencies);
    const exported = await exportConfig(dependencies);

    expect(result.config).toEqual({ version: 1, workspaces: {}, favoriteStacks: [], recentStacks: [] });
    expect(exported.config).toEqual(result.config);
  });

  it('rejects invalid JSON before saving imported config', () => {
    expect(() => parseImportedWorkspaceConfig('{', 'broken.json')).toThrow('Invalid compose config in broken.json');
  });

  it('rejects structurally invalid workspace config files', () => {
    expect(() => parseImportedWorkspaceConfig(JSON.stringify({ version: 1, workspaces: [], favoriteStacks: [], recentStacks: [] })))
      .toThrow('workspaces must be an object');
  });

  it('rejects config files with orphan workspace references', () => {
    const config = createValidConfig();
    const invalidConfig = {
      ...config,
      favoriteStacks: [
        {
          ...config.favoriteStacks[0],
          workspaceName: 'unknown',
        },
      ],
    };

    expect(() => parseImportedWorkspaceConfig(JSON.stringify(invalidConfig))).toThrow('favoriteStacks[0].workspaceName references unknown workspace unknown');
  });
});
