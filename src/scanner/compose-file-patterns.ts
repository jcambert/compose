export const composeFileNames = new Set([
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
]);

export const defaultExcludedDirectoryNames = new Set([
  '.git',
  '.idea',
  '.vscode',
  'node_modules',
  'dist',
  'coverage',
  'bin',
  'obj',
]);

export function isComposeFileName(fileName: string): boolean {
  return composeFileNames.has(fileName.toLowerCase());
}
