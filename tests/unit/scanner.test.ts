import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { scanComposeFiles } from '../../src/scanner/compose-file-scanner.js';

async function createTempDirectory(): Promise<string> {
  const directoryPath = join(tmpdir(), `compose-${randomUUID()}`);
  await mkdir(directoryPath, { recursive: true });
  return directoryPath;
}

describe('scanComposeFiles', () => {
  it('discovers Compose files recursively', async () => {
    const root = await createTempDirectory();
    const nested = join(root, 'apps', 'api');
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(nested, 'compose.yaml'),
      `services:
  api:
    image: node:22-alpine
`,
      'utf8',
    );

    const projects = await scanComposeFiles(root);

    expect(projects).toHaveLength(1);
    expect(projects[0]?.services).toEqual(['api']);
    expect(projects[0]?.composeFilePath).toContain('compose.yaml');
  });

  it('keeps invalid Compose files with warnings', async () => {
    const root = await createTempDirectory();
    await writeFile(join(root, 'docker-compose.yml'), 'services: [', 'utf8');

    const projects = await scanComposeFiles(root);

    expect(projects).toHaveLength(1);
    expect(projects[0]?.services).toEqual([]);
    expect(projects[0]?.warnings.length).toBeGreaterThan(0);
  });
});
