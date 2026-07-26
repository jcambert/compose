import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { parseComposeDocument, parseComposeDocumentContent } from '../../src/yaml/compose-parser.js';
import { validateComposeDocument } from '../../src/yaml/compose-validator.js';
import { stringifyComposeDocument, writeComposeDocument } from '../../src/yaml/compose-writer.js';

async function createTempDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), `compose-yaml-${randomUUID()}-`));
}

describe('compose YAML', () => {
  it('parses a Compose document from content', () => {
    const document = parseComposeDocumentContent(`
services:
  api:
    image: node:22-alpine
    ports:
      - "3000:3000"
`);

    expect(document.services.api?.image).toBe('node:22-alpine');
  });

  it('parses a Compose document from a file', async () => {
    const directory = await createTempDirectory();
    const composeFilePath = join(directory, 'compose.yaml');
    await writeComposeDocument(composeFilePath, {
      services: {
        api: {
          image: 'node:22-alpine',
        },
      },
    });

    const document = await parseComposeDocument(composeFilePath);

    expect(document.services.api?.image).toBe('node:22-alpine');
  });

  it('defaults missing services to an empty record', () => {
    const document = parseComposeDocumentContent('name: demo');

    expect(document).toEqual({ name: 'demo', services: {} });
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

  it('writes a Compose document to disk', async () => {
    const directory = await createTempDirectory();
    const composeFilePath = join(directory, 'nested', 'compose.yaml');

    await writeComposeDocument(composeFilePath, {
      services: {
        api: {
          image: 'node:22-alpine',
        },
      },
    });

    const content = await readFile(composeFilePath, 'utf8');

    expect(content).toContain('api:');
    expect(content).toContain('image: node:22-alpine');
  });

  it('rejects invalid YAML', () => {
    expect(() => parseComposeDocumentContent('services: [')).toThrow('Invalid YAML');
  });

  it('returns validation errors for invalid Compose values', () => {
    const validation = validateComposeDocument({ services: 'invalid' });

    expect(validation.success).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('throws before writing invalid Compose documents', () => {
    expect(() => stringifyComposeDocument({ services: 'invalid' } as never)).toThrow('Cannot write invalid Compose document');
  });
});
