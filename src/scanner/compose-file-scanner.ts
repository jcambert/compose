import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { parseComposeDocument } from '../yaml/compose-parser.js';
import { defaultExcludedDirectoryNames, isComposeFileName } from './compose-file-patterns.js';
import type { DiscoveredComposeProject } from './discovered-project.js';

export type ScanWarning = {
  type: 'directory-unreadable';
  path: string;
  message: string;
};

export type ScanLimitName = 'maxDirectoriesVisited' | 'maxEntriesVisited';

export class ScanLimitExceededError extends Error {
  readonly limitName: ScanLimitName;
  readonly limit: number;

  constructor(limitName: ScanLimitName, limit: number) {
    super(`Scanner limit exceeded: ${limitName}=${limit}. Narrow the root, increase the limit, or add directory exclusions.`);
    this.name = 'ScanLimitExceededError';
    this.limitName = limitName;
    this.limit = limit;
  }
}

export type ScanComposeFilesOptions = {
  maxDepth?: number;
  excludedDirectoryNames?: ReadonlySet<string>;
  additionalExcludedDirectoryNames?: readonly string[];
  maxDirectoriesVisited?: number;
  maxEntriesVisited?: number;
  onWarning?: (warning: ScanWarning) => void;
};

type ScanContext = {
  rootAbsolutePath: string;
  maxDepth: number;
  excludedDirectoryNames: ReadonlySet<string>;
  maxDirectoriesVisited: number;
  maxEntriesVisited: number;
  onWarning?: (warning: ScanWarning) => void;
  directoriesVisited: number;
  entriesVisited: number;
  projects: DiscoveredComposeProject[];
};

export const defaultMaxDirectoriesVisited = 50_000;
export const defaultMaxEntriesVisited = 250_000;

export async function scanComposeFiles(
  rootPath: string,
  options: ScanComposeFilesOptions = {},
): Promise<DiscoveredComposeProject[]> {
  const rootAbsolutePath = resolve(rootPath);
  const context: ScanContext = {
    rootAbsolutePath,
    maxDepth: readMaxDepth(options.maxDepth),
    excludedDirectoryNames: normalizeExcludedDirectoryNames(options.excludedDirectoryNames, options.additionalExcludedDirectoryNames),
    maxDirectoriesVisited: readPositiveIntegerLimit('maxDirectoriesVisited', options.maxDirectoriesVisited, defaultMaxDirectoriesVisited),
    maxEntriesVisited: readPositiveIntegerLimit('maxEntriesVisited', options.maxEntriesVisited, defaultMaxEntriesVisited),
    ...(options.onWarning === undefined ? {} : { onWarning: options.onWarning }),
    directoriesVisited: 0,
    entriesVisited: 0,
    projects: [],
  };

  await scanDirectory(rootAbsolutePath, 0, context);

  return context.projects.sort((left, right) => left.composeFilePath.localeCompare(right.composeFilePath));
}

async function scanDirectory(
  currentDirectoryPath: string,
  currentDepth: number,
  context: ScanContext,
): Promise<void> {
  recordDirectoryVisit(context);

  const entries = await readDirectoryEntries(currentDirectoryPath, context);
  const sortedEntries = entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of sortedEntries) {
    recordEntryVisit(context);

    if (entry.isSymbolicLink()) {
      continue;
    }

    const absolutePath = resolve(currentDirectoryPath, entry.name);

    if (entry.isDirectory()) {
      if (currentDepth < context.maxDepth && !isExcludedDirectory(entry.name, context.excludedDirectoryNames)) {
        await scanDirectory(absolutePath, currentDepth + 1, context);
      }

      continue;
    }

    if (entry.isFile() && isComposeFileName(entry.name)) {
      context.projects.push(await createDiscoveredProject(absolutePath, context.rootAbsolutePath));
    }
  }
}

async function readDirectoryEntries(currentDirectoryPath: string, context: ScanContext): Promise<Dirent[]> {
  try {
    return await readdir(currentDirectoryPath, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read directory.';

    if (currentDirectoryPath === context.rootAbsolutePath) {
      throw new Error(`Unable to read scan root ${currentDirectoryPath}: ${message}`);
    }

    context.onWarning?.({
      type: 'directory-unreadable',
      path: currentDirectoryPath,
      message,
    });
    return [];
  }
}

function recordDirectoryVisit(context: ScanContext): void {
  context.directoriesVisited += 1;

  if (context.directoriesVisited > context.maxDirectoriesVisited) {
    throw new ScanLimitExceededError('maxDirectoriesVisited', context.maxDirectoriesVisited);
  }
}

function recordEntryVisit(context: ScanContext): void {
  context.entriesVisited += 1;

  if (context.entriesVisited > context.maxEntriesVisited) {
    throw new ScanLimitExceededError('maxEntriesVisited', context.maxEntriesVisited);
  }
}

function isExcludedDirectory(directoryName: string, excludedDirectoryNames: ReadonlySet<string>): boolean {
  return excludedDirectoryNames.has(directoryName.toLowerCase());
}

function readMaxDepth(maxDepth: number | undefined): number {
  if (maxDepth === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    throw new Error(`Invalid maxDepth: ${maxDepth}. Expected a positive integer or zero.`);
  }

  return maxDepth;
}

function readPositiveIntegerLimit(limitName: ScanLimitName, value: number | undefined, defaultValue: number): number {
  const resolvedValue = value ?? defaultValue;

  if (!Number.isInteger(resolvedValue) || resolvedValue < 1) {
    throw new Error(`Invalid ${limitName}: ${resolvedValue}. Expected a positive integer.`);
  }

  return resolvedValue;
}

function normalizeExcludedDirectoryNames(
  excludedDirectoryNames: ReadonlySet<string> | undefined,
  additionalExcludedDirectoryNames: readonly string[] | undefined,
): ReadonlySet<string> {
  const normalizedNames = new Set<string>();
  const baseNames = excludedDirectoryNames ?? defaultExcludedDirectoryNames;

  for (const directoryName of baseNames) {
    addExcludedDirectoryName(normalizedNames, directoryName);
  }

  for (const directoryName of additionalExcludedDirectoryNames ?? []) {
    addExcludedDirectoryName(normalizedNames, directoryName);
  }

  return normalizedNames;
}

function addExcludedDirectoryName(excludedDirectoryNames: Set<string>, directoryName: string): void {
  const normalizedName = directoryName.trim().toLowerCase();

  if (normalizedName.length > 0) {
    excludedDirectoryNames.add(normalizedName);
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
