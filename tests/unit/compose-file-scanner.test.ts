import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { scanComposeFiles, ScanLimitExceededError } from '../../src/scanner/compose-file-scanner.js';

const tempDirectories: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'compose-scanner-'));
  tempDirectories.push(root);
  return root;
}

async function writeComposeFile(directory: string, serviceName = 'api'): Promise<string> {
  await mkdir(directory, { recursive: true });
  const composeFilePath = join(directory, 'compose.yaml');
  await writeFile(composeFilePath, `services:\n  ${serviceName}:\n    image: nginx\n`, 'utf-8');
  return composeFilePath;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('compose file scanner', () => {
  it('skips generated and dependency directories by default', async () => {
    const root = await createTempRoot();
    await writeComposeFile(join(root, 'app'), 'api');
    await writeComposeFile(join(root, 'node_modules', 'dependency'), 'hidden');
    await writeComposeFile(join(root, '.cache', 'tool'), 'hidden_cache');

    const projects = await scanComposeFiles(root);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      name: 'app',
      services: ['api'],
    });
  });

  it('applies additional directory exclusions case-insensitively', async () => {
    const root = await createTempRoot();
    await writeComposeFile(join(root, 'api'), 'api');
    await writeComposeFile(join(root, 'Generated'), 'generated');

    const projects = await scanComposeFiles(root, {
      additionalExcludedDirectoryNames: ['generated'],
    });

    expect(projects.map((project) => project.name)).toEqual(['api']);
  });

  it('keeps max depth semantics for shallow scans', async () => {
    const root = await createTempRoot();
    await writeComposeFile(root, 'root');
    await writeComposeFile(join(root, 'nested'), 'nested');

    const projects = await scanComposeFiles(root, { maxDepth: 0 });

    expect(projects.map((project) => project.name)).toEqual([root.split(/[\\/]/).at(-1)]);
  });

  it('fails fast when the directory visit limit is exceeded', async () => {
    const root = await createTempRoot();
    await mkdir(join(root, 'a'), { recursive: true });

    await expect(scanComposeFiles(root, { maxDirectoriesVisited: 1 })).rejects.toMatchObject({
      name: 'ScanLimitExceededError',
      limitName: 'maxDirectoriesVisited',
      limit: 1,
    } satisfies Partial<ScanLimitExceededError>);
  });

  it('fails fast when the scanned entry limit is exceeded', async () => {
    const root = await createTempRoot();
    await writeFile(join(root, 'one.txt'), '', 'utf-8');
    await writeFile(join(root, 'two.txt'), '', 'utf-8');

    await expect(scanComposeFiles(root, { maxEntriesVisited: 1 })).rejects.toMatchObject({
      name: 'ScanLimitExceededError',
      limitName: 'maxEntriesVisited',
      limit: 1,
    } satisfies Partial<ScanLimitExceededError>);
  });

  it('reports unreadable nested directories through warnings instead of failing the whole scan', async () => {
    const root = await createTempRoot();
    const warningMessages: string[] = [];
    await writeComposeFile(join(root, 'app'), 'api');

    const projects = await scanComposeFiles(root, {
      onWarning(warning) {
        warningMessages.push(`${warning.type}:${warning.path}`);
      },
    });

    expect(projects).toHaveLength(1);
    expect(warningMessages).toEqual([]);
  });
});
