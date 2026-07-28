import { scanComposeFiles } from '../scanner/compose-file-scanner.js';
import type { ScanComposeFilesOptions } from '../scanner/compose-file-scanner.js';
import type { DiscoveredComposeProject } from '../scanner/discovered-project.js';

export type ScanComposeProjectsInput = {
  root?: string;
  maxDepth?: number;
};

export type ScanComposeProjectsDependencies = {
  scan?: (root: string, options: ScanComposeFilesOptions) => Promise<DiscoveredComposeProject[]>;
};

export async function scanComposeProjects(
  input: ScanComposeProjectsInput = {},
  dependencies: ScanComposeProjectsDependencies = {},
): Promise<DiscoveredComposeProject[]> {
  const scan = dependencies.scan ?? scanComposeFiles;
  return scan(input.root ?? '.', createScanComposeFilesOptions(input.maxDepth));
}

function createScanComposeFilesOptions(maxDepth: number | undefined): ScanComposeFilesOptions {
  return maxDepth === undefined ? {} : { maxDepth };
}
