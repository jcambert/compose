import { resolve } from 'node:path';

export function toAbsolutePath(path: string): string {
  return resolve(path);
}

export function normalisePathForDisplay(path: string): string {
  return path.replaceAll('\\\\', '/');
}
