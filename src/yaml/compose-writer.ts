import { writeFile } from 'node:fs/promises';
import { stringify } from 'yaml';
import { ensureParentDirectory } from '../utils/fs-utils.js';
import { ComposeYamlError } from '../utils/errors.js';
import { validateComposeDocument } from './compose-validator.js';
import type { ComposeDocument } from './schemas/compose-schema.js';

export function stringifyComposeDocument(document: ComposeDocument): string {
  const validation = validateComposeDocument(document);

  if (!validation.success) {
    throw new ComposeYamlError(`Cannot write invalid Compose document: ${validation.errors.join('; ')}`);
  }

  return stringify(validation.document, {
    indent: 2,
    lineWidth: 120,
  });
}

export async function writeComposeDocument(filePath: string, document: ComposeDocument): Promise<void> {
  await ensureParentDirectory(filePath);
  await writeFile(filePath, stringifyComposeDocument(document), 'utf8');
}
