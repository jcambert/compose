import { join, resolve } from 'node:path';
import { ensureDirectory, pathExists } from '../utils/fs-utils.js';
import { ComposeProjectError } from '../utils/errors.js';
import { writeComposeDocument } from '../yaml/compose-writer.js';
import type { ComposeDocument } from '../yaml/schemas/compose-schema.js';
import type { ComposeProject } from './compose-project.js';

export type CreateComposeProjectOptions = {
  name?: string;
  overwrite?: boolean;
};

export function createStandardComposeDocument(name?: string): ComposeDocument {
  return {
    ...(name === undefined ? {} : { name }),
    services: {},
    networks: {},
    volumes: {},
  };
}

export async function createComposeProject(
  directoryPath: string,
  options: CreateComposeProjectOptions = {},
): Promise<ComposeProject> {
  const absoluteDirectoryPath = resolve(directoryPath);
  const composeFilePath = join(absoluteDirectoryPath, 'compose.yaml');

  if (!options.overwrite && (await pathExists(composeFilePath))) {
    throw new ComposeProjectError(`Compose file already exists: ${composeFilePath}`);
  }

  const document = createStandardComposeDocument(options.name);
  await ensureDirectory(absoluteDirectoryPath);
  await writeComposeDocument(composeFilePath, document);

  return {
    directoryPath: absoluteDirectoryPath,
    composeFilePath,
    document,
  };
}
