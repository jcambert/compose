import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { composeFileNames } from '../scanner/compose-file-patterns.js';
import { pathExists } from '../utils/fs-utils.js';
import { ComposeProjectError } from '../utils/errors.js';

export async function resolveComposeFilePath(projectPath?: string, explicitFilePath?: string): Promise<string> {
  if (explicitFilePath !== undefined) {
    return resolve(explicitFilePath);
  }

  const candidatePath = resolve(projectPath ?? process.cwd());
  const candidateStat = await stat(candidatePath);

  if (candidateStat.isFile()) {
    return candidatePath;
  }

  if (!candidateStat.isDirectory()) {
    throw new ComposeProjectError(`Unsupported project path: ${candidatePath}`);
  }

  for (const fileName of composeFileNames) {
    const composeFilePath = join(candidatePath, fileName);

    if (await pathExists(composeFilePath)) {
      return composeFilePath;
    }
  }

  throw new ComposeProjectError(`No Compose file found in directory: ${candidatePath}`);
}
