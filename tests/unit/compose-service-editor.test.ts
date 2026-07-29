import { describe, expect, it } from 'vitest';
import {
  applyComposeServiceMutation,
  createComposeServiceMutationPreview,
  listEditableComposeServices,
} from '../../src/yaml/compose-service-editor.js';
import { parseComposeDocumentContent } from '../../src/yaml/compose-parser.js';
import type { ComposeDocument } from '../../src/yaml/schemas/compose-schema.js';

const baseContent = `name: demo
services:
  api:
    image: node:20-alpine
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
    labels:
      com.example.owner: team-a
    x-internal-note: keep-me
  db:
    image: postgres:17
volumes:
  data: {}
x-stack-owner: platform
`;

function createDocument(): ComposeDocument {
  return parseComposeDocumentContent(baseContent, 'compose.yaml');
}

describe('Compose service YAML editor', () => {
  it('lists editable services with read-only and preserved keys', () => {
    const services = listEditableComposeServices(createDocument());

    expect(services.map((service) => service.name)).toEqual(['api', 'db']);
    expect(services[0]?.image).toBe('node:20-alpine');
    expect(services[0]?.ports).toEqual(['3000:3000']);
    expect(services[0]?.environment).toEqual([{ name: 'NODE_ENV', value: 'development' }]);
    expect(services[0]?.readOnlyKeys).toEqual(['labels']);
    expect(services[0]?.preservedKeys).toEqual(['x-internal-note']);
  });

  it('creates a service while preserving existing top-level keys', () => {
    const document = createDocument();
    const updated = applyComposeServiceMutation(document, {
      operation: 'create',
      service: {
        name: 'worker',
        image: 'node:22-alpine',
        command: 'npm run worker',
        dependsOn: ['api'],
        restart: 'unless-stopped',
      },
    });

    expect(updated.services.worker).toEqual({
      image: 'node:22-alpine',
      command: 'npm run worker',
      depends_on: ['api'],
      restart: 'unless-stopped',
    });
    expect(updated.volumes).toEqual(document.volumes);
    expect(updated['x-stack-owner']).toBe('platform');
  });

  it('updates common fields while preserving unsupported service keys', () => {
    const document = createDocument();
    const updated = applyComposeServiceMutation(document, {
      operation: 'update',
      serviceName: 'api',
      patch: {
        image: 'node:22-alpine',
        ports: ['8080:3000'],
        environment: [
          { name: 'NODE_ENV', value: 'production' },
          { name: 'LOG_LEVEL', value: 'debug' },
        ],
        volumes: ['./api:/app'],
      },
    });

    expect(updated.services.api?.image).toBe('node:22-alpine');
    expect(updated.services.api?.ports).toEqual(['8080:3000']);
    expect(updated.services.api?.environment).toEqual({ NODE_ENV: 'production', LOG_LEVEL: 'debug' });
    expect(updated.services.api?.volumes).toEqual(['./api:/app']);
    expect(updated.services.api?.labels).toEqual({ 'com.example.owner': 'team-a' });
    expect(updated.services.api?.['x-internal-note']).toBe('keep-me');
  });

  it('deletes only the requested service', () => {
    const updated = applyComposeServiceMutation(createDocument(), {
      operation: 'delete',
      serviceName: 'api',
    });

    expect(updated.services.api).toBeUndefined();
    expect(updated.services.db?.image).toBe('postgres:17');
    expect(updated.volumes).toEqual({ data: {} });
  });

  it('creates a diff preview before writing', () => {
    const preview = createComposeServiceMutationPreview({
      composeFilePath: '/workspace/compose.yaml',
      originalContent: baseContent,
      originalContentHash: 'hash',
      document: createDocument(),
      mutation: {
        operation: 'update',
        serviceName: 'api',
        patch: {
          image: 'node:22-alpine',
        },
      },
    });

    expect(preview.operation).toBe('update');
    expect(preview.serviceName).toBe('api');
    expect(preview.beforeYaml).toContain('node:20-alpine');
    expect(preview.afterYaml).toContain('node:22-alpine');
    expect(preview.diff).toContain('-    image: node:20-alpine');
    expect(preview.diff).toContain('+    image: node:22-alpine');
    expect(preview.warnings).toContain('Service key preserved by the guided editor: labels');
  });

  it('rejects duplicate services and unknown service updates', () => {
    const document = createDocument();

    expect(() => applyComposeServiceMutation(document, {
      operation: 'create',
      service: {
        name: 'api',
        image: 'node:22-alpine',
      },
    })).toThrow('Service already exists: api');

    expect(() => applyComposeServiceMutation(document, {
      operation: 'update',
      serviceName: 'missing',
      patch: {
        image: 'node:22-alpine',
      },
    })).toThrow('Service does not exist: missing');
  });
});
