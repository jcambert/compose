import { readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { ComposeYamlError } from '../utils/errors.js';
import { validateComposeDocument } from './compose-validator.js';
import type { ComposeDocument } from './schemas/compose-schema.js';

export async function parseComposeDocument(filePath: string): Promise<ComposeDocument> {
  const content = await readFile(filePath, 'utf8');
  return parseComposeDocumentContent(content, filePath);
}

export function parseComposeDocumentContent(content: string, sourceName = 'compose document'): ComposeDocument {
  const yamlDocument = parseDocument(content, { prettyErrors: true });

  if (yamlDocument.errors.length > 0) {
    const message = yamlDocument.errors.map((error) => error.message).join('; ');
    throw new ComposeYamlError(`Invalid YAML in ${sourceName}: ${message}`);
  }

  const rawValue = yamlDocument.toJS() ?? {};
  const validation = validateComposeDocument(rawValue);

  if (!validation.success) {
    throw new ComposeYamlError(`Invalid Compose document in ${sourceName}: ${validation.errors.join('; ')}`);
  }

  return validation.document;
}
