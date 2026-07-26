import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComposeError, ComposeProjectError, ComposeYamlError } from '../../src/utils/errors.js';
import { ensureDirectory, ensureParentDirectory, pathExists } from '../../src/utils/fs-utils.js';
import { consoleLogger } from '../../src/utils/logger.js';
import { normalisePathForDisplay, toAbsolutePath } from '../../src/utils/path-utils.js';

async function createTempDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), `compose-utils-${randomUUID()}-`));
}

describe('errors', () => {
  it('sets stable error names', () => {
    expect(new ComposeError('base').name).toBe('ComposeError');
    expect(new ComposeYamlError('yaml').name).toBe('ComposeYamlError');
    expect(new ComposeProjectError('project').name).toBe('ComposeProjectError');
  });
});

describe('fs-utils', () => {
  it('detects whether a path exists', async () => {
    const directory = await createTempDirectory();

    await expect(pathExists(directory)).resolves.toBe(true);
    await expect(pathExists(join(directory, 'missing'))).resolves.toBe(false);
  });

  it('creates directories and parent directories', async () => {
    const directory = await createTempDirectory();
    const nestedDirectory = join(directory, 'a', 'b');
    const filePath = join(directory, 'parent', 'child', 'file.txt');

    await ensureDirectory(nestedDirectory);
    await ensureParentDirectory(filePath);

    await expect(stat(nestedDirectory)).resolves.toMatchObject({});
    await expect(stat(join(directory, 'parent', 'child'))).resolves.toMatchObject({});
  });
});

describe('path-utils', () => {
  it('resolves absolute paths', () => {
    expect(toAbsolutePath('.')).toBe(resolve('.'));
  });

  it('normalises Windows separators for display', () => {
    expect(normalisePathForDisplay('C:\\Sources\\compose')).toBe('C:/Sources/compose');
  });
});

describe('consoleLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes informational messages', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    consoleLogger.info('hello');

    expect(spy).toHaveBeenCalledWith('hello');
  });

  it('writes warning messages', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    consoleLogger.warn('careful');

    expect(spy).toHaveBeenCalledWith('careful');
  });

  it('writes error messages', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    consoleLogger.error('broken');

    expect(spy).toHaveBeenCalledWith('broken');
  });
});
