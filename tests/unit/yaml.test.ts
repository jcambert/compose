import { describe, expect, it } from 'vitest';
import { parseComposeDocumentContent } from '../../src/yaml/compose-parser.js';
import { stringifyComposeDocument } from '../../src/yaml/compose-writer.js';

describe('compose YAML', () => {
  it('parses a Compose document', () => {
    const document = parseComposeDocumentContent(`
services:
  api:
    image: node:22-alpine
    ports:
      - "3000:3000"
`);

    expect(document.services.api?.image).toBe('node:22-alpine');
  });

  it('stringifies a Compose document', () => {
    const content = stringifyComposeDocument({
      name: 'demo',
      services: {
        api: {
          image: 'node:22-alpine',
        },
      },
    });

    expect(content).toContain('name: demo');
    expect(content).toContain('image: node:22-alpine');
  });

  it('rejects invalid YAML', () => {
    expect(() => parseComposeDocumentContent('services: [')).toThrow('Invalid YAML');
  });
});
