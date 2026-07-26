import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createComposeCliProgram } from '../../src/cli/program.js';
import { resolvePackageVersion } from '../../src/cli/package-metadata.js';

type PackageMetadata = {
  version: string;
};

describe('package metadata', () => {
  it('resolves the package version from package.json', () => {
    const packageMetadata = readPackageMetadata();

    expect(resolvePackageVersion()).toBe(packageMetadata.version);
  });

  it('uses package.json as the CLI version source', () => {
    const packageMetadata = readPackageMetadata();
    const program = createComposeCliProgram();

    expect(program.version()).toBe(packageMetadata.version);
  });
});

function readPackageMetadata(): PackageMetadata {
  const packageJsonUrl = new URL('../../package.json', import.meta.url);
  const packageJsonContent = readFileSync(packageJsonUrl, 'utf8');

  return JSON.parse(packageJsonContent) as PackageMetadata;
}
