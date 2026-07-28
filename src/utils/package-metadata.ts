import { readFileSync } from 'node:fs';

const fallbackPackageVersion = '0.0.0';

type PackageMetadata = {
  version?: unknown;
};

export function resolvePackageVersion(): string {
  try {
    const packageJsonUrl = new URL('../../package.json', import.meta.url);
    const packageJsonContent = readFileSync(packageJsonUrl, 'utf8');
    const packageMetadata = JSON.parse(packageJsonContent) as PackageMetadata;

    if (typeof packageMetadata.version === 'string' && packageMetadata.version.length > 0) {
      return packageMetadata.version;
    }
  } catch {
    // Keep CLI startup and diagnostics safe when package metadata cannot be read.
  }

  return fallbackPackageVersion;
}
