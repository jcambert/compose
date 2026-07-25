import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { parseComposeDocument } from '../yaml/compose-parser.js';
import { defaultExcludedDirectoryNames, isComposeFileName } from './compose-file-patterns.js';
import type { DiscoveredComposeProject } from './discovered-project.js';

export type ScanComposeFilesOptions = {
  maxDepth?: number;
  excludedDirectoryNames?: ReadonlySet<string>;
};

export async function scanComposeFiles(
  rootPath: string,
  options: ScanComposeFilesOptions = {},
): Promise<DiscoveredComposeProject[]> {
  const rootAbsolutePath = resolve(rootPath);
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const excludedDirectoryNames = options.excludedDirectoryNames ?? defaultExcludedDirectoryNames;
  const projects: DiscoveredComposeProject[] = [];

  await scanDirectory(rootAbsolutePath, 0, rootAbsolutePath, maxDepth, excludedDirectoryNames, projects);

  return projects.sort((left, right) => left.composeFilePath.localeCompare(right.composeFilePath));
}

async function scanDirectory(
  currentDirectoryPath: string,
  currentDepth: number,
  rootAbsolutePath: string,
  maxDepth: number,
  excludedDirectoryNames: ReadonlySet<string>,
  projects: DiscoveredComposeProject[],
): Promise<void> {
  const entries = await readdir(currentDirectoryPath, { withFileTypes: true });
  const sortedEntries = entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of sortedEntries) {
    const absolutePath = resolve(currentDirectoryPath, entry.name);

    if (entry.isDirectory()) {
      if (currentDepth < maxDepth && !excludedDirectoryNames.has(entry.name)) {
        await scanDirectory(absolutePath, currentDepth + 1, rootAbsolutePath, maxDepth, excludedDirectoryNames, projects);
      }

      continue;
    }

    if (entry.isFile() && isComposeFileName(entry.name)) {
      projects.push(await createDiscoveredProject(absolutePath, rootAbsolutePath));
    }
  }
}

async function createDiscoveredProject(
  composeFilePath: string,
  rootAbsolutePath: string,
): Promise<DiscoveredComposeProject> {
  const directoryPath = dirname(composeFilePath);
  const warnings: string[] = [];
  let services: string[] = [];

  try {
    const document = await parseComposeDocument(composeFilePath);
    services = Object.keys(document.services).sort();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to parse Compose file.';
    warnings.push(message);
  }

  return {
    id: createProjectId(composeFilePath),
    name: basename(directoryPath),
    composeFilePath,
    directoryPath,
    relativePath: relative(rootAbsolutePath, composeFilePath),
    services,
    warnings,
  };
}

function createProjectId(composeFilePath: string): string {
  return createHash('sha1').update(composeFilePath).digest('hex').slice(0, 12);
}
