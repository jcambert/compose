export const composeFileNames = new Set([
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
]);

export const defaultExcludedDirectoryNames = new Set<string>([
  '.angular',
  '.cache',
  '.git',
  '.gradle',
  '.idea',
  '.m2',
  '.next',
  '.nuxt',
  '.parcel-cache',
  '.pnpm-store',
  '.serverless',
  '.terraform',
  '.turbo',
  '.venv',
  '.vs',
  '.vscode',
  '.yarn',
  '__pycache__',
  'bin',
  'build',
  'coverage',
  'dist',
  'env',
  'node_modules',
  'obj',
  'out',
  'target',
  'tmp',
  'venv',
]);

export function isComposeFileName(fileName: string): boolean {
  return composeFileNames.has(fileName.toLowerCase());
}
