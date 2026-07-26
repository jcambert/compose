import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  createComposeProject,
  createStandardComposeDocument,
} from '../../src/project/project-factory.js';

async function createTempDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), `compose-project-${randomUUID()}-`));
}

describe('createStandardComposeDocument', () => {
  it('creates an empty Compose document without a name by default', () => {
    expect(createStandardComposeDocument()).toEqual({
      services: {},
      networks: {},
      volumes: {},
    });
  });

  it('creates an empty Compose document with a name', () => {
    expect(createStandardComposeDocument('demo')).toEqual({
      name: 'demo',
      services: {},
      networks: {},
      volumes: {},
    });
  });
});

describe('createComposeProject', () => {
  it('creates a compose.yaml file in the target directory', async () => {
    const directory = await createTempDirectory();

    const project = await createComposeProject(directory, { name: 'demo' });
    const content = await readFile(project.composeFilePath, 'utf8');

    expect(project.directoryPath).toBe(directory);
    expect(project.composeFilePath).toBe(join(directory, 'compose.yaml'));
    expect(content).toContain('name: demo');
    expect(content).toContain('services: {}');
  });

  it('rejects creating over an existing compose.yaml by default', async () => {
    const directory = await createTempDirectory();
    await createComposeProject(directory);

    await expect(createComposeProject(directory)).rejects.toThrow('Compose file already exists');
  });

  it('overwrites an existing compose.yaml when requested', async () => {
    const directory = await createTempDirectory();
    await createComposeProject(directory, { name: 'old' });

    const project = await createComposeProject(directory, { name: 'new', overwrite: true });
    const content = await readFile(project.composeFilePath, 'utf8');

    expect(content).toContain('name: new');
  });
});
