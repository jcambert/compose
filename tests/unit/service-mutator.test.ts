import { describe, expect, it } from 'vitest';
import { addService, removeService, updateService } from '../../src/project/service-mutator.js';
import type { ComposeDocument } from '../../src/yaml/schemas/compose-schema.js';

describe('service mutator', () => {
  it('adds a service', () => {
    const document: ComposeDocument = { services: {} };

    const updated = addService(document, 'api', { image: 'node:22-alpine' });

    expect(updated.services.api?.image).toBe('node:22-alpine');
    expect(document.services.api).toBeUndefined();
  });

  it('updates a service', () => {
    const document: ComposeDocument = { services: { api: { image: 'node:20-alpine' } } };

    const updated = updateService(document, 'api', { image: 'node:22-alpine' });

    expect(updated.services.api?.image).toBe('node:22-alpine');
  });

  it('removes a service', () => {
    const document: ComposeDocument = { services: { api: { image: 'node:22-alpine' } } };

    const updated = removeService(document, 'api');

    expect(updated.services.api).toBeUndefined();
  });

  it('rejects invalid service names', () => {
    const document: ComposeDocument = { services: {} };

    expect(() => addService(document, 'bad service', { image: 'node:22-alpine' })).toThrow('Invalid service name');
  });
});
