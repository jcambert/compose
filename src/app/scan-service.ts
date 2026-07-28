import { scanComposeFiles } from '../scanner/compose-file-scanner.js';
import type { ScanComposeFilesOptions, ScanWarning } from '../scanner/compose-file-scanner.js';
import type { DiscoveredComposeProject } from '../scanner/discovered-project.js';

export type ScanComposeProjectsInput = {
  root?: string;
  maxDepth?: number;
  additionalExcludedDirectoryNames?: string[];
  maxDirectoriesVisited?: number;
  maxEntriesVisited?: number;
  onWarning?: (warning: ScanWarning) => void;
};

export type ScanComposeProjectsDependencies = {
  scan?: (root: string, options: ScanComposeFilesOptions) => Promise<DiscoveredComposeProject[]>;
};

export async function scanComposeProjects(
  input: ScanComposeProjectsInput = {},
  dependencies: ScanComposeProjectsDependencies = {},
): Promise<DiscoveredComposeProject[]> {
  const scan = dependencies.scan ?? scanComposeFiles;
  return scan(input.root ?? '.', createScanComposeFilesOptions(input));
}

function createScanComposeFilesOptions(input: ScanComposeProjectsInput): ScanComposeFilesOptions {
  const options: ScanComposeFilesOptions = {};

  if (input.maxDepth !== undefined) {
    options.maxDepth = input.maxDepth;
  }

  if (input.additionalExcludedDirectoryNames !== undefined) {
    options.additionalExcludedDirectoryNames = input.additionalExcludedDirectoryNames;
  }

  if (input.maxDirectoriesVisited !== undefined) {
    options.maxDirectoriesVisited = input.maxDirectoriesVisited;
  }

  if (input.maxEntriesVisited !== undefined) {
    options.maxEntriesVisited = input.maxEntriesVisited;
  }

  if (input.onWarning !== undefined) {
    options.onWarning = input.onWarning;
  }

  return options;
}
