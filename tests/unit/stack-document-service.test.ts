import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  commitStackDocument,
  defaultStackComposeYaml,
  deleteStackDocument,
  previewStackCreation,
  previewStackDocumentUpdate,
  readStackDocument,
  StackDocumentConflictError,
  summarizeDocument,
  validateDotEnvContent,
} from '../../src/app/stack-document-service.js';
import { parseComposeDocumentContent } from '../../src/yaml/compose-parser.js';

describe('stack document service', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'compose-stack-document-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads YAML, environment content and document summaries', async () => {
    const composeFilePath = await createStack('demo', [
      'services:', '  web:', '    image: nginx', 'networks:',
      '  public:', '    external: true', '  private: {}',
      'x-dockge:', '  urls:', '    - https://localhost:8443/app',
      '    - javascript:alert(1)', '',
    ].join('\n'), 'PORT=8443\n');

    const result = await readStackDocument(composeFilePath);

    expect(result).toMatchObject({
      stackName: 'demo',
      env: 'PORT=8443\n',
      envFileExists: true,
      services: ['web'],
      networks: [
        { name: 'private', external: false },
        { name: 'public', external: true },
      ],
      urls: ['https://localhost:8443/app'],
    });
    expect(result.contentHash).toHaveLength(64);
    expect(result.envContentHash).toHaveLength(64);
  });

  it('distinguishes a missing .env from an empty existing file', async () => {
    const composeFilePath = await createStack('missing-env', defaultStackComposeYaml);
    const missing = await readStackDocument(composeFilePath);
    await writeFile(join(root, 'missing-env', '.env'), '', 'utf8');
    const present = await readStackDocument(composeFilePath);

    expect(missing).toMatchObject({ env: '', envFileExists: false });
    expect(present).toMatchObject({ env: '', envFileExists: true });
    expect(missing.envContentHash).not.toBe(present.envContentHash);
  });

  it('previews exact YAML and .env diffs and commits both files', async () => {
    const composeFilePath = await createStack('editable', defaultStackComposeYaml, 'PORT=8080\n');
    const nextYaml = defaultStackComposeYaml.replace('nginx:latest', 'nginx:alpine');
    const preview = await previewStackDocumentUpdate({
      composeFilePath,
      yaml: nextYaml,
      env: 'PORT=9090\n',
    });

    expect(preview).toMatchObject({ operation: 'update', validation: { success: true, errors: [] } });
    expect(preview.composeDiff).toContain('-    image: nginx:latest');
    expect(preview.composeDiff).toContain('+    image: nginx:alpine');
    expect(preview.envDiff).toContain('-PORT=8080');
    expect(preview.envDiff).toContain('+PORT=9090');

    const committed = await commitStackDocument({ preview, composeFilePath });

    expect(committed.yaml).toBe(nextYaml);
    expect(committed.env).toBe('PORT=9090\n');
    expect(await readFile(composeFilePath, 'utf8')).toBe(nextYaml);
  });

  it('rejects a stale preview when stack files change externally', async () => {
    const composeFilePath = await createStack('stale', defaultStackComposeYaml, 'PORT=8080\n');
    const preview = await previewStackDocumentUpdate({
      composeFilePath,
      yaml: defaultStackComposeYaml,
      env: 'PORT=9090\n',
    });
    await writeFile(join(root, 'stale', '.env'), 'PORT=7070\n', 'utf8');

    await expect(commitStackDocument({ preview, composeFilePath }))
      .rejects.toBeInstanceOf(StackDocumentConflictError);
  });

  it('creates a new stack without overwriting a directory', async () => {
    const preview = await previewStackCreation({
      workspaceRoot: root,
      stackName: 'new_stack',
      yaml: defaultStackComposeYaml,
      env: 'PORT=8080\n',
    });
    const created = await commitStackDocument({ preview, workspaceRoot: root });

    expect(created).toMatchObject({
      stackName: 'new_stack',
      envFileExists: true,
      services: ['nginx'],
    });
    await expect(commitStackDocument({ preview, workspaceRoot: root }))
      .rejects.toBeInstanceOf(StackDocumentConflictError);
  });

  it('deletes only a confirmed file-only stack directory', async () => {
    const composeFilePath = await createStack('removable', defaultStackComposeYaml, 'PORT=8080\n');
    const current = await readStackDocument(composeFilePath);
    const result = await deleteStackDocument({
      composeFilePath,
      expectedContentHash: current.contentHash,
      expectedEnvContentHash: current.envContentHash,
      confirmedStackName: 'removable',
    });

    expect(result.removedFiles).toEqual([join(root, 'removable', '.env'), composeFilePath]);
    await expect(stat(join(root, 'removable'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses unsafe deletion targets', async () => {
    const composeFilePath = await createStack('protected', defaultStackComposeYaml, 'PORT=8080\n');
    const current = await readStackDocument(composeFilePath);

    await expect(deleteStackDocument({
      composeFilePath,
      expectedContentHash: current.contentHash,
      expectedEnvContentHash: current.envContentHash,
      confirmedStackName: 'wrong-name',
    })).rejects.toThrow('must exactly match');
    await expect(deleteStackDocument({
      composeFilePath,
      expectedContentHash: 'stale',
      expectedEnvContentHash: current.envContentHash,
      confirmedStackName: 'protected',
    })).rejects.toBeInstanceOf(StackDocumentConflictError);
    const envFilePath = join(root, 'protected', '.env');
    await writeFile(envFilePath, 'PORT=9090\n', 'utf8');
    await expect(deleteStackDocument({
      composeFilePath,
      expectedContentHash: current.contentHash,
      expectedEnvContentHash: current.envContentHash,
      confirmedStackName: 'protected',
    })).rejects.toBeInstanceOf(StackDocumentConflictError);
    await writeFile(envFilePath, 'PORT=8080\n', 'utf8');


    await writeFile(join(root, 'protected', 'README.md'), '# keep\n', 'utf8');
    await expect(deleteStackDocument({
      composeFilePath,
      expectedContentHash: current.contentHash,
      expectedEnvContentHash: current.envContentHash,
      confirmedStackName: 'protected',
    })).rejects.toThrow('unrelated entries: README.md');
  });

  it('validates stack names, YAML and environment declarations', async () => {
    validateDotEnvContent('# comment\nexport PORT=8080\nOPTIONAL\n');
    expect(() => validateDotEnvContent('NOT VALID=value\n')).toThrow('line 1');

    for (const stackName of ['../escape', 'Uppercase']) {
      await expect(previewStackCreation({
        workspaceRoot: root,
        stackName,
        yaml: defaultStackComposeYaml,
        env: '',
      })).rejects.toThrow('Invalid stack name');
    }

    await expect(previewStackCreation({
      workspaceRoot: root,
      stackName: 'invalid-yaml',
      yaml: 'services: [',
      env: '',
    })).rejects.toThrow('Invalid YAML');
  });

  it('summarizes malformed extension sections defensively', () => {
    const empty = parseComposeDocumentContent('services: {}\nx-dockge: string\n');
    const mixed = parseComposeDocumentContent([
      'services: {}', 'x-dockge:', '  urls:', '    - 42',
      '    - not-a-url', '    - http://localhost', '',
    ].join('\n'));

    expect(summarizeDocument(empty)).toEqual({ services: [], networks: [], urls: [] });
    expect(summarizeDocument(mixed).urls).toEqual(['http://localhost']);
  });

  async function createStack(name: string, yaml: string, env?: string): Promise<string> {
    const directoryPath = join(root, name);
    const composeFilePath = join(directoryPath, 'compose.yaml');
    await mkdir(directoryPath);
    await writeFile(composeFilePath, yaml, 'utf8');
    if (env !== undefined) await writeFile(join(directoryPath, '.env'), env, 'utf8');
    return composeFilePath;
  }
});
