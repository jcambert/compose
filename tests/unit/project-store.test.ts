import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { loadComposeProject, saveComposeProject } from '../../src/project/project-store.js';

async function createTempDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), `compose-store-${randomUUID()}-`));
}

describe('project store', () => {
  it('loads a Compose project from a file', async () => {
    const directory = await createTempDirectory();
    const composeFilePath = join(directory, 'compose.yaml');
    await writeFile(
      composeFilePath,
      `services:
  api:
    image: node:22-alpine
`,
      'utf8',
    );

    const project = await loadComposeProject(composeFilePath);

    expect(project.directoryPath).toBe(dirname(composeFilePath));
    expect(project.composeFilePath).toBe(composeFilePath);
    expect(project.document.services.api?.image).toBe('node:22-alpine');
  });

  it('saves a Compose project to its file', async () => {
    const directory = await createTempDirectory();
    const composeFilePath = join(directory, 'compose.yaml');

    await saveComposeProject({
      directoryPath: directory,
      composeFilePath,
      document: {
        services: {
          api: {
            image: 'node:22-alpine',
          },
        },
      },
    });

    const content = await readFile(composeFilePath, 'utf8');

    expect(content).toContain('api:');
    expect(content).toContain('image: node:22-alpine');
  });
});
