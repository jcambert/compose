import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  commitComposeServiceMutation,
  listComposeServices,
  previewCreateComposeService,
  previewDeleteComposeService,
  previewUpdateComposeService,
} from '../../src/app/compose-editing-service.js';
import { parseComposeDocumentContent } from '../../src/yaml/compose-parser.js';

const fixturePath = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/compose/realistic-stack.compose.yaml');

async function copyFixture(lineEnding: '\n' | '\r\n' = '\n'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'compose-real-stack-'));
  const composeFilePath = join(root, 'compose.yaml');
  const normalized = (await readFile(fixturePath, 'utf8')).replace(/\r\n/g, '\n');
  await writeFile(composeFilePath, normalized.replace(/\n/g, lineEnding), 'utf8');
  return composeFilePath;
}

describe('realistic Compose editing workflow', () => {
  it.each(['\n', '\r\n'] as const)('preserves advanced sections while updating common fields', async (lineEnding) => {
    const composeFilePath = await copyFixture(lineEnding);
    const preview = await previewUpdateComposeService({
      composeFilePath,
      serviceName: 'api',
      patch: {
        image: 'node:24-alpine',
        ports: ['9090:3000'],
        environment: [
          { name: 'NODE_ENV', value: 'staging' },
          { name: 'DATABASE_URL', value: 'postgres://app:secret@db:5432/app' },
        ],
        volumes: ['./src:/app/src:ro', './logs:/app/logs'],
      },
    });

    expect(preview.warnings).toEqual(expect.arrayContaining([
      'Service key preserved by the guided editor: <<',
      'Service key preserved by the guided editor: configs',
      'Service key preserved by the guided editor: deploy',
      'Service key preserved by the guided editor: healthcheck',
      'Service key preserved by the guided editor: secrets',
    ]));

    await commitComposeServiceMutation({ preview });
    const document = parseComposeDocumentContent(await readFile(composeFilePath, 'utf8'), composeFilePath);
    const api = document.services.api;

    expect(api?.image).toBe('node:24-alpine');
    expect(api?.ports).toEqual(['9090:3000']);
    expect(api?.healthcheck).toBeDefined();
    expect(api?.deploy).toBeDefined();
    expect(api?.['<<']).toBeDefined();
    expect(api?.secrets).toBeDefined();
    expect(api?.configs).toBeDefined();
    expect(document.networks?.backend).toBeDefined();
    expect(document.volumes?.database).toBeDefined();
    expect(document.secrets?.api_token).toBeDefined();
    expect(document.configs?.app_config).toBeDefined();
  });

  it('supports create and delete without touching unrelated services', async () => {
    const composeFilePath = await copyFixture();
    const createPreview = await previewCreateComposeService({
      composeFilePath,
      service: {
        name: 'worker',
        image: 'node:22-alpine',
        command: ['node', 'worker.js'],
        dependsOn: ['db'],
        environment: [{ name: 'QUEUE', value: 'default' }],
        restart: 'on-failure',
      },
    });

    await commitComposeServiceMutation({ preview: createPreview });
    const listed = await listComposeServices({ composeFilePath });
    expect(listed.services.map((service) => service.name)).toEqual(['api', 'db', 'worker']);

    const deletePreview = await previewDeleteComposeService({ composeFilePath, serviceName: 'worker' });
    await commitComposeServiceMutation({ preview: deletePreview });

    const saved = parseComposeDocumentContent(await readFile(composeFilePath, 'utf8'), composeFilePath);
    expect(saved.services.worker).toBeUndefined();
    expect(saved.services.api?.healthcheck).toBeDefined();
    expect(saved.services.db?.image).toBe('postgres:17-alpine');
  });

  it('rejects an obsolete preview after an external Windows-style rewrite', async () => {
    const composeFilePath = await copyFixture();
    const preview = await previewUpdateComposeService({
      composeFilePath,
      serviceName: 'api',
      patch: { image: 'node:24-alpine' },
    });
    const current = await readFile(composeFilePath, 'utf8');
    await writeFile(composeFilePath, current.replace(/\n/g, '\r\n').replace('postgres:17-alpine', 'postgres:16-alpine'), 'utf8');

    await expect(commitComposeServiceMutation({ preview })).rejects.toThrow('Compose file changed since preview was generated');
  });
});
