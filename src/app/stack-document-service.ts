import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { ComposeProjectError } from '../utils/errors.js';
import { parseComposeDocumentContent } from '../yaml/compose-parser.js';
import { createUnifiedDiff } from '../yaml/compose-service-editor.js';
import type { ComposeDocument } from '../yaml/schemas/compose-schema.js';

const stackNamePattern = /^[a-z0-9][a-z0-9_-]*$/;
const environmentNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const defaultStackComposeYaml = [
  'services:',
  '  nginx:',
  '    image: nginx:latest',
  '    restart: unless-stopped',
  '    ports:',
  '      - "8080:80"',
  '',
].join('\n');

export type StackNetworkSummary = {
  name: string;
  external: boolean;
};

export type StackDocumentSummary = {
  services: string[];
  networks: StackNetworkSummary[];
  urls: string[];
};

export type StackDocument = StackDocumentSummary & {
  stackName: string;
  composeFilePath: string;
  envFilePath: string;
  yaml: string;
  env: string;
  contentHash: string;
  envContentHash: string;
  envFileExists: boolean;
};

export type StackDocumentPreview = StackDocumentSummary & {
  operation: 'create' | 'update';
  stackName: string;
  composeFilePath: string;
  envFilePath: string;
  yaml: string;
  env: string;
  originalContentHash: string;
  originalEnvContentHash: string;
  originalEnvFileExists: boolean;
  composeDiff: string;
  envDiff: string;
  diff: string;
  validation: {
    success: true;
    errors: [];
  };
};

export type PreviewStackDocumentUpdateInput = {
  composeFilePath: string;
  yaml: string;
  env: string;
};

export type PreviewStackCreationInput = {
  workspaceRoot: string;
  stackName: string;
  yaml: string;
  env: string;
};

export type CommitStackDocumentInput = {
  preview: StackDocumentPreview;
  composeFilePath?: string;
  workspaceRoot?: string;
};

export type DeleteStackDocumentInput = {
  composeFilePath: string;
  expectedContentHash: string;
  expectedEnvContentHash: string;
  confirmedStackName: string;
};

export type DeleteStackDocumentResult = {
  stackName: string;
  directoryPath: string;
  removedFiles: string[];
};

export class StackDocumentConflictError extends ComposeProjectError {}

export async function readStackDocument(composeFilePath: string): Promise<StackDocument> {
  const absoluteComposeFilePath = resolve(composeFilePath);
  const envFilePath = join(dirname(absoluteComposeFilePath), '.env');
  const [composeState, envState] = await Promise.all([
    readRequiredFileState(absoluteComposeFilePath),
    readOptionalFileState(envFilePath),
  ]);
  const document = parseComposeDocumentContent(composeState.content, absoluteComposeFilePath);
  const summary = summarizeDocument(document);

  return {
    stackName: stackNameFor(absoluteComposeFilePath),
    composeFilePath: absoluteComposeFilePath,
    envFilePath,
    yaml: composeState.content,
    env: envState.content,
    contentHash: hashFileState(composeState),
    envContentHash: hashFileState(envState),
    envFileExists: envState.exists,
    ...summary,
  };
}

export async function previewStackDocumentUpdate(
  input: PreviewStackDocumentUpdateInput,
): Promise<StackDocumentPreview> {
  const current = await readStackDocument(input.composeFilePath);
  const document = validateStackSources(input.yaml, input.env, current.composeFilePath);
  const summary = summarizeDocument(document);

  return createPreview({
    operation: 'update',
    stackName: stackNameFor(current.composeFilePath),
    composeFilePath: current.composeFilePath,
    envFilePath: current.envFilePath,
    yaml: input.yaml,
    env: input.env,
    originalYaml: current.yaml,
    originalEnv: current.env,
    originalContentHash: current.contentHash,
    originalEnvContentHash: current.envContentHash,
    originalEnvFileExists: current.envFileExists,
    summary,
  });
}

export async function previewStackCreation(
  input: PreviewStackCreationInput,
): Promise<StackDocumentPreview> {
  assertStackName(input.stackName);
  const workspaceRoot = resolve(input.workspaceRoot);
  const directoryPath = resolve(workspaceRoot, input.stackName);
  assertPathWithinWorkspace(directoryPath, workspaceRoot);

  if (await pathExists(directoryPath)) {
    throw new ComposeProjectError(`Stack directory already exists: ${directoryPath}`);
  }

  const composeFilePath = join(directoryPath, 'compose.yaml');
  const envFilePath = join(directoryPath, '.env');
  const document = validateStackSources(input.yaml, input.env, composeFilePath);
  const summary = summarizeDocument(document);
  const missingState = { exists: false, content: '' };

  return createPreview({
    operation: 'create',
    stackName: input.stackName,
    composeFilePath,
    envFilePath,
    yaml: input.yaml,
    env: input.env,
    originalYaml: '',
    originalEnv: '',
    originalContentHash: hashFileState(missingState),
    originalEnvContentHash: hashFileState(missingState),
    originalEnvFileExists: false,
    summary,
  });
}

export async function commitStackDocument(
  input: CommitStackDocumentInput,
): Promise<StackDocument> {
  validateStackSources(input.preview.yaml, input.preview.env, input.preview.composeFilePath);

  if (input.preview.operation === 'create') {
    await commitStackCreation(input);
  } else {
    await commitStackUpdate(input);
  }

  return readStackDocument(input.preview.composeFilePath);
}

export async function deleteStackDocument(
  input: DeleteStackDocumentInput,
): Promise<DeleteStackDocumentResult> {
  const current = await readStackDocument(input.composeFilePath);

  if (input.confirmedStackName !== current.stackName) {
    throw new ComposeProjectError(
      `Stack deletion confirmation must exactly match: ${current.stackName}`,
    );
  }

  if (
    input.expectedContentHash !== current.contentHash
    || input.expectedEnvContentHash !== current.envContentHash
  ) {
    throw new StackDocumentConflictError(
      `Stack files changed before deletion: ${current.composeFilePath}`,
    );
  }

  const directoryPath = dirname(current.composeFilePath);
  const allowedNames = new Set([basename(current.composeFilePath), '.env']);
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const unrelatedEntries = entries.filter((entry) => !allowedNames.has(entry.name));

  if (unrelatedEntries.length > 0) {
    throw new ComposeProjectError(
      `Refusing to delete stack directory with unrelated entries: ${unrelatedEntries.map((entry) => entry.name).join(', ')}`,
    );
  }

  const removedFiles: string[] = [];

  if (current.envFileExists) {
    await unlink(current.envFilePath);
    removedFiles.push(current.envFilePath);
  }

  await unlink(current.composeFilePath);
  removedFiles.push(current.composeFilePath);
  await rmdir(directoryPath);

  return {
    stackName: current.stackName,
    directoryPath,
    removedFiles,
  };
}

export function validateDotEnvContent(content: string): void {
  const lines = content.split(/\r?\n/);

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();

    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    const declaration = line.startsWith('export ') ? line.slice('export '.length).trimStart() : line;
    const separator = declaration.indexOf('=');
    const name = (separator === -1 ? declaration : declaration.slice(0, separator)).trim();

    if (!environmentNamePattern.test(name)) {
      throw new ComposeProjectError(`Invalid .env variable on line ${index + 1}: ${name || '(empty)'}`);
    }
  }
}

export function summarizeDocument(document: ComposeDocument): StackDocumentSummary {
  const networks = Object.entries(document.networks ?? {})
    .map(([name, value]) => ({
      name,
      external: isObject(value) && value.external === true,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    services: Object.keys(document.services).sort(),
    networks,
    urls: readDeclaredUrls(document),
  };
}

function createPreview(input: {
  operation: StackDocumentPreview['operation'];
  stackName: string;
  composeFilePath: string;
  envFilePath: string;
  yaml: string;
  env: string;
  originalYaml: string;
  originalEnv: string;
  originalContentHash: string;
  originalEnvContentHash: string;
  originalEnvFileExists: boolean;
  summary: StackDocumentSummary;
}): StackDocumentPreview {
  const composeDiff = createUnifiedDiff(
    input.originalYaml,
    input.yaml,
    input.operation === 'create' ? '/dev/null' : input.composeFilePath,
    input.composeFilePath,
  );
  const envDiff = createUnifiedDiff(
    input.originalEnv,
    input.env,
    input.operation === 'create' || !input.originalEnvFileExists ? '/dev/null' : input.envFilePath,
    input.envFilePath,
  );

  return {
    operation: input.operation,
    stackName: input.stackName,
    composeFilePath: input.composeFilePath,
    envFilePath: input.envFilePath,
    yaml: input.yaml,
    env: input.env,
    originalContentHash: input.originalContentHash,
    originalEnvContentHash: input.originalEnvContentHash,
    originalEnvFileExists: input.originalEnvFileExists,
    composeDiff,
    envDiff,
    diff: [composeDiff, envDiff].filter((value) => value.length > 0).join('\n'),
    validation: { success: true, errors: [] },
    ...input.summary,
  };
}

async function commitStackUpdate(input: CommitStackDocumentInput): Promise<void> {
  const expectedPath = resolve(input.composeFilePath ?? input.preview.composeFilePath);

  if (resolve(input.preview.composeFilePath) !== expectedPath) {
    throw new ComposeProjectError('Stack document preview does not match the selected stack.');
  }

  const current = await readStackDocument(expectedPath);

  if (
    current.contentHash !== input.preview.originalContentHash
    || current.envContentHash !== input.preview.originalEnvContentHash
  ) {
    throw new StackDocumentConflictError(
      `Stack files changed since preview was generated: ${expectedPath}`,
    );
  }

  const files = [{ path: expectedPath, content: input.preview.yaml }];

  if (input.preview.originalEnvFileExists || input.preview.env.length > 0) {
    files.push({ path: current.envFilePath, content: input.preview.env });
  }

  await replaceFilesTransactionally(files);
}

async function commitStackCreation(input: CommitStackDocumentInput): Promise<void> {
  if (input.workspaceRoot === undefined) {
    throw new ComposeProjectError('Workspace root is required to create a stack.');
  }

  assertStackName(input.preview.stackName);
  const workspaceRoot = resolve(input.workspaceRoot);
  const directoryPath = resolve(workspaceRoot, input.preview.stackName);
  const expectedComposeFilePath = join(directoryPath, 'compose.yaml');
  assertPathWithinWorkspace(directoryPath, workspaceRoot);

  if (resolve(input.preview.composeFilePath) !== expectedComposeFilePath) {
    throw new ComposeProjectError('Stack creation preview does not match the active workspace.');
  }

  if (await pathExists(directoryPath)) {
    throw new StackDocumentConflictError(`Stack directory already exists: ${directoryPath}`);
  }

  await mkdir(directoryPath);

  try {
    const files = [{ path: expectedComposeFilePath, content: input.preview.yaml }];

    if (input.preview.env.length > 0) {
      files.push({ path: join(directoryPath, '.env'), content: input.preview.env });
    }

    await replaceFilesTransactionally(files);
  } catch (error) {
    await rmdir(directoryPath).catch(() => undefined);
    throw error;
  }
}

async function replaceFilesTransactionally(files: Array<{ path: string; content: string }>): Promise<void> {
  const transactionId = randomUUID();
  const prepared = await Promise.all(files.map(async (file) => {
    const state = await readOptionalFileState(file.path);
    const temporaryPath = join(dirname(file.path), `.${basename(file.path)}.${transactionId}.tmp`);
    const backupPath = join(dirname(file.path), `.${basename(file.path)}.${transactionId}.bak`);
    await writeFile(temporaryPath, file.content, 'utf8');
    return { ...file, state, temporaryPath, backupPath, installed: false, backedUp: false };
  }));

  try {
    for (const file of prepared) {
      if (file.state.exists) {
        await rename(file.path, file.backupPath);
        file.backedUp = true;
      }
    }

    for (const file of prepared) {
      await rename(file.temporaryPath, file.path);
      file.installed = true;
    }
  } catch (error) {
    for (const file of [...prepared].reverse()) {
      if (file.installed) {
        await unlink(file.path).catch(() => undefined);
      }
      if (file.backedUp) {
        await rename(file.backupPath, file.path).catch(() => undefined);
      }
    }
    throw error;
  } finally {
    await Promise.all(prepared.flatMap((file) => [
      unlink(file.temporaryPath).catch(() => undefined),
      unlink(file.backupPath).catch(() => undefined),
    ]));
  }
}

function validateStackSources(yaml: string, env: string, sourceName: string): ComposeDocument {
  const document = parseComposeDocumentContent(yaml, sourceName);
  validateDotEnvContent(env);
  return document;
}

function stackNameFor(composeFilePath: string): string {
  return basename(dirname(composeFilePath));
}

function assertStackName(stackName: string): void {
  if (!stackNamePattern.test(stackName)) {
    throw new ComposeProjectError(
      `Invalid stack name: ${stackName}. Use lowercase letters, numbers, underscores and hyphens.`,
    );
  }
}

function assertPathWithinWorkspace(candidatePath: string, workspaceRoot: string): void {
  const rootWithSeparator = workspaceRoot.endsWith(sep) ? workspaceRoot : `${workspaceRoot}${sep}`;

  if (!candidatePath.startsWith(rootWithSeparator)) {
    throw new ComposeProjectError('Stack path must remain inside the active workspace.');
  }
}

function readDeclaredUrls(document: ComposeDocument): string[] {
  const extension = document['x-dockge'];

  if (!isObject(extension) || !Array.isArray(extension.urls)) {
    return [];
  }

  return extension.urls.filter((value): value is string => {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  });
}

type FileState = {
  exists: boolean;
  content: string;
};

async function readRequiredFileState(filePath: string): Promise<FileState> {
  return { exists: true, content: await readFile(filePath, 'utf8') };
}

async function readOptionalFileState(filePath: string): Promise<FileState> {
  try {
    return await readRequiredFileState(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return { exists: false, content: '' };
    }
    throw error;
  }
}

function hashFileState(state: FileState): string {
  return createHash('sha256')
    .update(state.exists ? 'present\0' : 'missing\0')
    .update(state.content)
    .digest('hex');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return false;
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
