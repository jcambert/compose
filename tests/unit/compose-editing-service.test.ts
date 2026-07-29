import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  commitComposeServiceMutation,
  listComposeServices,
  previewCreateComposeService,
  previewDeleteComposeService,
  previewUpdateComposeService,
} from '../../src/app/compose-editing-service.js';
import { parseComposeDocumentContent } from '../../src/yaml/compose-parser.js';

async function createComposeFile(content = createComposeContent()): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'compose-editing-service-'));
  const composeFilePath = join(root, 'compose.yaml');
  await writeFile(composeFilePath, content, 'utf8');
  return composeFilePath;
}

function createComposeContent(): string {
  return `services:
  api:
    image: node:20-alpine
    ports:
      - "3000:3000"
    x-extra: preserved
  db:
    image: postgres:17
volumes:
  data: {}
`;
}

describe('Compose editing application service', () => {
  it('lists services from a Compose file target', async () => {
    const composeFilePath = await createComposeFile();
    const result = await listComposeServices({ composeFilePath });

    expect(result.composeFilePath).toBe(composeFilePath);
    expect(result.contentHash).toHaveLength(64);
    expect(result.services.map((service) => service.name)).toEqual(['api', 'db']);
    expect(result.services[0]?.preservedKeys).toEqual(['x-extra']);
  });

  it('previews and commits a service update with optimistic file change protection', async () => {
    const composeFilePath = await createComposeFile();
    const preview = await previewUpdateComposeService({
      composeFilePath,
      serviceName: 'api',
      patch: {
        image: 'node:22-alpine',
        ports: ['8080:3000'],
      },
    });

    expect(preview.diff).toContain('-    image: node:20-alpine');
    expect(preview.diff).toContain('+    image: node:22-alpine');

    const commit = await commitComposeServiceMutation({ preview });
    const saved = await readFile(composeFilePath, 'utf8');
    const document = parseComposeDocumentContent(saved, composeFilePath);

    expect(commit.contentHash).toHaveLength(64);
    expect(document.services.api?.image).toBe('node:22-alpine');
    expect(document.services.api?.ports).toEqual(['8080:3000']);
    expect(document.services.api?.['x-extra']).toBe('preserved');
  });

  it('creates and deletes services through previews', async () => {
    const composeFilePath = await createComposeFile();
    const createPreview = await previewCreateComposeService({
      composeFilePath,
      service: {
        name: 'worker',
        image: 'node:22-alpine',
        command: 'npm run worker',
        environment: [{ name: 'NODE_ENV', value: 'production' }],
        dependsOn: ['api'],
      },
    });

    await commitComposeServiceMutation({ preview: createPreview });
    const deletePreview = await previewDeleteComposeService({ composeFilePath, serviceName: 'worker' });

    expect(deletePreview.beforeYaml).toContain('worker:');
    expect(deletePreview.afterYaml).toBeUndefined();

    await commitComposeServiceMutation({ preview: deletePreview });
    const saved = await readFile(composeFilePath, 'utf8');
    const document = parseComposeDocumentContent(saved, composeFilePath);

    expect(document.services.worker).toBeUndefined();
    expect(document.services.api?.image).toBe('node:20-alpine');
  });

  it('rejects commits when the file changed after preview', async () => {
    const composeFilePath = await createComposeFile();
    const preview = await previewUpdateComposeService({
      composeFilePath,
      serviceName: 'api',
      patch: {
        image: 'node:22-alpine',
      },
    });

    await writeFile(composeFilePath, createComposeContent().replace('postgres:17', 'postgres:16'), 'utf8');

    await expect(commitComposeServiceMutation({ preview })).rejects.toThrow('Compose file changed since preview was generated');
  });

  it('rejects invalid YAML before previewing mutations', async () => {
    const composeFilePath = await createComposeFile('services:\n  api: [');

    await expect(previewUpdateComposeService({
      composeFilePath,
      serviceName: 'api',
      patch: {
        image: 'node:22-alpine',
      },
    })).rejects.toThrow('Invalid YAML');
  });
});
