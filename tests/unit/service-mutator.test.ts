import { describe, expect, it } from 'vitest';
import { addService, removeService, updateService } from '../../src/project/service-mutator.js';
import type { ComposeDocument } from '../../src/yaml/schemas/compose-schema.js';

describe('service mutator', () => {
  it('adds a service without mutating the original document', () => {
    const document: ComposeDocument = { services: {} };

    const updated = addService(document, 'api', { image: 'node:22-alpine' });

    expect(updated.services.api?.image).toBe('node:22-alpine');
    expect(document.services.api).toBeUndefined();
  });

  it('overwrites an existing service when explicitly requested', () => {
    const document: ComposeDocument = { services: { api: { image: 'node:20-alpine' } } };

    const updated = addService(document, 'api', { image: 'node:22-alpine' }, { overwrite: true });

    expect(updated.services.api?.image).toBe('node:22-alpine');
  });

  it('rejects duplicate services by default', () => {
    const document: ComposeDocument = { services: { api: { image: 'node:20-alpine' } } };

    expect(() => addService(document, 'api', { image: 'node:22-alpine' })).toThrow('Service already exists');
  });

  it('updates a service while preserving existing properties', () => {
    const document: ComposeDocument = {
      services: {
        api: {
          image: 'node:20-alpine',
          ports: ['3000:3000'],
        },
      },
    };

    const updated = updateService(document, 'api', { image: 'node:22-alpine' });

    expect(updated.services.api?.image).toBe('node:22-alpine');
    expect(updated.services.api?.ports).toEqual(['3000:3000']);
  });

  it('rejects updates for unknown services', () => {
    const document: ComposeDocument = { services: {} };

    expect(() => updateService(document, 'api', { image: 'node:22-alpine' })).toThrow('Service does not exist');
  });

  it('removes a service', () => {
    const document: ComposeDocument = { services: { api: { image: 'node:22-alpine' } } };

    const updated = removeService(document, 'api');

    expect(updated.services.api).toBeUndefined();
  });

  it('rejects removing an unknown service', () => {
    const document: ComposeDocument = { services: {} };

    expect(() => removeService(document, 'api')).toThrow('Service does not exist');
  });

  it('rejects invalid service names', () => {
    const document: ComposeDocument = { services: {} };

    expect(() => addService(document, 'bad service', { image: 'node:22-alpine' })).toThrow('Invalid service name');
  });
});
