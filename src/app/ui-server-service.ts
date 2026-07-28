import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { platform as getPlatform } from 'node:os';
import { dirname, extname, isAbsolute, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { execa } from 'execa';
import type { BuiltComposeCommand, ComposeSubCommand } from '../compose/compose-command.js';
import type { ProcessRunner } from '../compose/compose-executor.js';
import type { StackRuntimeStatus } from '../interactive/stack-runtime-status.js';
import { readStackRuntimeStatus } from '../interactive/stack-runtime-status.js';
import type { DiscoveredComposeProject } from '../scanner/discovered-project.js';
import { executeComposeApplicationCommand, previewComposeApplicationCommand } from './compose-command-service.js';
import type {
  ComposeApplicationCommandInput,
  ComposeApplicationCommandOptions,
  ComposeApplicationCommandResult,
} from './compose-command-service.js';
import { runDoctor } from './doctor-service.js';
import type { DoctorOptions, DoctorReport } from './doctor-service.js';
import { scanComposeProjects } from './scan-service.js';
import { listWorkspaceEntries } from './workspace-service.js';
import type { WorkspaceListResult } from './workspace-service.js';

export type LocalUiServerOptions = {
  port?: number;
  token?: string;
  open?: boolean;
  workspaceName?: string;
  skipDocker?: boolean;
  uiAssetRoot?: string;
};

export type LocalUiServer = {
  host: '127.0.0.1';
  port: number;
  token: string;
  url: string;
  server: Server;
  close: () => Promise<void>;
};

export type LocalUiServerDependencies = {
  openBrowser?: (url: string) => Promise<void> | void;
  runDoctor?: (options?: DoctorOptions) => Promise<DoctorReport>;
  listWorkspaces?: () => Promise<WorkspaceListResult>;
  scanProjects?: (input: { root?: string; maxDepth?: number }) => Promise<DiscoveredComposeProject[]>;
  readRuntimeStatus?: (project: DiscoveredComposeProject) => Promise<StackRuntimeStatus>;
  previewCommand?: (input: ComposeApplicationCommandInput) => Promise<BuiltComposeCommand>;
  executeCommand?: (input: ComposeApplicationCommandInput) => Promise<ComposeApplicationCommandResult>;
};

type RuntimeDependencies = {
  openBrowser: (url: string) => Promise<void> | void;
  runDoctor: (options?: DoctorOptions) => Promise<DoctorReport>;
  listWorkspaces: () => Promise<WorkspaceListResult>;
  scanProjects: (input: { root?: string; maxDepth?: number }) => Promise<DiscoveredComposeProject[]>;
  readRuntimeStatus: (project: DiscoveredComposeProject) => Promise<StackRuntimeStatus>;
  previewCommand: (input: ComposeApplicationCommandInput) => Promise<BuiltComposeCommand>;
  executeCommand: (input: ComposeApplicationCommandInput) => Promise<ComposeApplicationCommandResult>;
};

type RequestContext = {
  token: string;
  options: LocalUiServerOptions;
  dependencies: RuntimeDependencies;
  uiAssetRoot: string;
};

type StackScanContext = {
  root: string;
  workspaceName?: string;
  maxDepth?: number;
};

type CommandPayload = {
  input: ComposeApplicationCommandInput;
  confirmed: boolean;
  destructiveConfirmed: boolean;
};

type JsonObject = Record<string, unknown>;

const localUiHost = '127.0.0.1' as const;
const maximumRequestBodyBytes = 1024 * 1024;
const currentModuleDirectory = dirname(fileURLToPath(import.meta.url));
const defaultUiAssetRoot = resolve(currentModuleDirectory, '..', 'ui');
const destructiveCommands = new Set<ComposeSubCommand>(['down', 'kill', 'rm']);
const composeSubCommands = new Set<ComposeSubCommand>([
  'up',
  'down',
  'ps',
  'logs',
  'build',
  'pull',
  'restart',
  'exec',
  'run',
  'stop',
  'start',
  'create',
  'pause',
  'unpause',
  'kill',
  'rm',
  'config',
  'cp',
  'events',
  'images',
  'ls',
  'port',
  'top',
  'version',
  'watch',
]);

const captureProcessRunner: ProcessRunner = async (binary, args, options) => {
  const result = await execa(binary, args, {
    cwd: options.cwd,
    reject: false,
  });

  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

export async function startLocalUiServer(
  options: LocalUiServerOptions = {},
  dependencies: LocalUiServerDependencies = {},
): Promise<LocalUiServer> {
  const token = options.token ?? randomBytes(24).toString('hex');
  const runtimeDependencies = createRuntimeDependencies(dependencies);
  const context: RequestContext = {
    token,
    options,
    dependencies: runtimeDependencies,
    uiAssetRoot: resolve(options.uiAssetRoot ?? defaultUiAssetRoot),
  };
  const server = createServer((request, response) => {
    void handleRequest(request, response, context);
  });

  await listen(server, options.port ?? 0, localUiHost);

  const address = server.address();

  if (!isAddressInfo(address)) {
    await closeServer(server);
    throw new Error('Unable to resolve the local UI server address.');
  }

  const url = `http://${localUiHost}:${address.port}/?token=${encodeURIComponent(token)}`;

  if (options.open !== false) {
    await Promise.resolve(runtimeDependencies.openBrowser(url)).catch(() => undefined);
  }

  return {
    host: localUiHost,
    port: address.port,
    token,
    url,
    server,
    async close() {
      await closeServer(server);
    },
  };
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, context: RequestContext): Promise<void> {
  try {
    const url = new URL(request.url ?? '/', `http://${localUiHost}`);

    if (request.method === 'GET' && url.pathname === '/') {
      if (!isAuthorized(request, url, context.token)) {
        sendError(response, 401, 'unauthorized', 'Invalid or missing local UI token.');
        return;
      }

      sendHtml(response, await readTokenizedUiIndexHtml(context));
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
      await sendUiAsset(response, url.pathname, context);
      return;
    }

    if (url.pathname.startsWith('/api/') && !isAuthorized(request, url, context.token)) {
      sendError(response, 401, 'unauthorized', 'Invalid or missing local UI token.');
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, { ok: true, host: localUiHost });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/doctor') {
      const skipDocker = readBooleanQuery(url, 'skipDocker') ?? context.options.skipDocker ?? true;
      sendJson(response, 200, await context.dependencies.runDoctor({ skipDocker }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/workspaces') {
      sendJson(response, 200, await context.dependencies.listWorkspaces());
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/stacks') {
      const scanContext = await resolveStackScanContext(url, context);
      const stacks = await scanProjects(scanContext, context.dependencies);
      sendJson(response, 200, {
        root: scanContext.root,
        ...(scanContext.workspaceName === undefined ? {} : { workspaceName: scanContext.workspaceName }),
        stacks,
      });
      return;
    }

    const runtimeProjectId = matchStackRuntimePath(url.pathname);

    if (request.method === 'GET' && runtimeProjectId !== undefined) {
      const scanContext = await resolveStackScanContext(url, context);
      const stacks = await scanProjects(scanContext, context.dependencies);
      const project = findProject(stacks, runtimeProjectId);

      if (project === undefined) {
        sendError(response, 404, 'stack-not-found', `Stack not found: ${runtimeProjectId}`);
        return;
      }

      sendJson(response, 200, await context.dependencies.readRuntimeStatus(project));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/commands/preview') {
      const payload = parseCommandPayload(await readRequestJson(request));
      sendJson(response, 200, await context.dependencies.previewCommand(payload.input));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/commands/execute') {
      const payload = parseCommandPayload(await readRequestJson(request));

      if (!payload.confirmed) {
        sendError(response, 409, 'confirmation-required', 'Command execution requires confirmed: true.');
        return;
      }

      if (destructiveCommands.has(payload.input.command) && !payload.destructiveConfirmed) {
        sendError(response, 409, 'destructive-confirmation-required', 'Destructive command execution requires destructiveConfirmed: true.');
        return;
      }

      sendJson(response, 200, await context.dependencies.executeCommand(payload.input));
      return;
    }

    sendError(response, 404, 'not-found', `Route not found: ${request.method ?? 'UNKNOWN'} ${url.pathname}`);
  } catch (error) {
    if (error instanceof LocalUiHttpError) {
      sendError(response, error.statusCode, error.code, error.message);
      return;
    }

    sendError(response, 500, 'internal-error', error instanceof Error ? error.message : 'Unexpected local UI server error.');
  }
}

function createRuntimeDependencies(dependencies: LocalUiServerDependencies): RuntimeDependencies {
  return {
    openBrowser: dependencies.openBrowser ?? openLocalBrowser,
    runDoctor: dependencies.runDoctor ?? runDoctor,
    listWorkspaces: dependencies.listWorkspaces ?? listWorkspaceEntries,
    scanProjects: dependencies.scanProjects ?? scanComposeProjects,
    readRuntimeStatus: dependencies.readRuntimeStatus ?? ((project) => readStackRuntimeStatus(project, {})),
    previewCommand: dependencies.previewCommand ?? ((input) => previewComposeApplicationCommand(input)),
    executeCommand: dependencies.executeCommand ?? ((input) => executeComposeApplicationCommand(input, { processRunner: captureProcessRunner })),
  };
}

async function resolveStackScanContext(url: URL, context: RequestContext): Promise<StackScanContext> {
  const root = readOptionalStringQuery(url, 'root');
  const maxDepth = readOptionalIntegerQuery(url, 'maxDepth');

  if (root !== undefined) {
    return { root, ...(maxDepth === undefined ? {} : { maxDepth }) };
  }

  const workspaceName = readOptionalStringQuery(url, 'workspace') ?? context.options.workspaceName;
  const workspaceResult = await context.dependencies.listWorkspaces();

  if (workspaceName !== undefined) {
    const workspace = workspaceResult.workspaces.find((candidate) => candidate.name === workspaceName);

    if (workspace === undefined) {
      throw new LocalUiHttpError(404, 'workspace-not-found', `Workspace not found: ${workspaceName}`);
    }

    return {
      root: workspace.path,
      workspaceName: workspace.name,
      ...(maxDepth === undefined ? {} : { maxDepth }),
    };
  }

  if (workspaceResult.currentWorkspaceName !== undefined) {
    const workspace = workspaceResult.workspaces.find((candidate) => candidate.name === workspaceResult.currentWorkspaceName);

    if (workspace !== undefined) {
      return {
        root: workspace.path,
        workspaceName: workspace.name,
        ...(maxDepth === undefined ? {} : { maxDepth }),
      };
    }
  }

  return { root: '.', ...(maxDepth === undefined ? {} : { maxDepth }) };
}

async function scanProjects(scanContext: StackScanContext, dependencies: RuntimeDependencies): Promise<DiscoveredComposeProject[]> {
  return dependencies.scanProjects({
    root: scanContext.root,
    ...(scanContext.maxDepth === undefined ? {} : { maxDepth: scanContext.maxDepth }),
  });
}

async function readTokenizedUiIndexHtml(context: RequestContext): Promise<string> {
  try {
    const html = await readFile(resolve(context.uiAssetRoot, 'index.html'), 'utf-8');
    return injectUiToken(html, context.token);
  } catch {
    return createMissingUiAssetsHtml(context.token);
  }
}

function injectUiToken(html: string, token: string): string {
  const tokenScript = `<script>window.__COMPOSE_UI_TOKEN__=${JSON.stringify(token)};</script>`;

  if (html.includes('</head>')) {
    return html.replace('</head>', `  ${tokenScript}\n</head>`);
  }

  return `${tokenScript}\n${html}`;
}

async function sendUiAsset(response: ServerResponse, pathname: string, context: RequestContext): Promise<void> {
  const assetPath = resolveAssetPath(context.uiAssetRoot, pathname);

  if (assetPath === undefined) {
    sendError(response, 400, 'invalid-asset-path', 'Invalid UI asset path.');
    return;
  }

  try {
    const assetStats = await stat(assetPath);

    if (!assetStats.isFile()) {
      sendError(response, 404, 'asset-not-found', 'UI asset not found.');
      return;
    }

    sendStatic(response, await readFile(assetPath), contentTypeFor(assetPath));
  } catch {
    sendError(response, 404, 'asset-not-found', 'UI asset not found.');
  }
}

function resolveAssetPath(assetRoot: string, pathname: string): string | undefined {
  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }

  const relativePath = normalize(decodedPath.replace(/^\/+/, ''));

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return undefined;
  }

  const candidatePath = resolve(assetRoot, relativePath);
  const rootWithSeparator = assetRoot.endsWith(sep) ? assetRoot : `${assetRoot}${sep}`;

  if (candidatePath !== assetRoot && !candidatePath.startsWith(rootWithSeparator)) {
    return undefined;
  }

  return candidatePath;
}

function contentTypeFor(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.css':
      return 'text/css; charset=utf-8';
    case '.gif':
      return 'image/gif';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.ico':
      return 'image/x-icon';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.json':
    case '.map':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function createMissingUiAssetsHtml(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>compose UI</title>
  <script>window.__COMPOSE_UI_TOKEN__=${JSON.stringify(token)};</script>
  <style>
    :root { color: #e5e7eb; background: #0f172a; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at top left, rgba(59,130,246,.26), transparent 36rem), #0f172a; }
    main { width: min(720px, calc(100vw - 2rem)); border: 1px solid rgba(148,163,184,.24); border-radius: 1.25rem; padding: 1.5rem; background: rgba(15,23,42,.86); box-shadow: 0 24px 80px rgba(0,0,0,.35); }
    code { color: #bfdbfe; }
    p { color: #94a3b8; line-height: 1.6; }
  </style>
</head>
<body>
  <main>
    <p>Loading compose UI...</p>
    <h1>UI assets are not available</h1>
    <p>The local API is running, but the bundled React assets were not found. Run <code>npm run build</code> before starting <code>compose ui</code> from a source checkout.</p>
  </main>
</body>
</html>`;
}

function parseCommandPayload(value: unknown): CommandPayload {
  if (!isObject(value)) {
    throw new LocalUiHttpError(400, 'invalid-json', 'Command request body must be a JSON object.');
  }

  const command = readComposeSubCommand(value.command);
  const services = readOptionalStringArray(value.services) ?? [];
  const options = readOptions(value.options);
  const passthroughArgs = readOptionalStringArray(value.passthroughArgs);
  const composeFilePath = readOptionalString(value.composeFilePath);
  const input: ComposeApplicationCommandInput = {
    command,
    services,
    options: {
      ...options,
      guided: false,
      interactive: false,
    },
    ...(passthroughArgs === undefined ? {} : { passthroughArgs }),
    ...(composeFilePath === undefined ? {} : { composeFilePath }),
  };

  return {
    input,
    confirmed: value.confirmed === true,
    destructiveConfirmed: value.destructiveConfirmed === true,
  };
}

function readOptions(value: unknown): ComposeApplicationCommandOptions {
  if (value === undefined) {
    return {};
  }

  if (!isObject(value)) {
    throw new LocalUiHttpError(400, 'invalid-options', 'Command options must be a JSON object when provided.');
  }

  return value as ComposeApplicationCommandOptions;
}

async function readRequestJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    totalBytes += buffer.byteLength;

    if (totalBytes > maximumRequestBodyBytes) {
      throw new LocalUiHttpError(413, 'payload-too-large', 'Request body is too large.');
    }

    chunks.push(buffer);
  }

  const content = Buffer.concat(chunks).toString('utf-8').trim();

  if (content.length === 0) {
    return {};
  }

  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Invalid JSON.';
    throw new LocalUiHttpError(400, 'invalid-json', `Invalid JSON request body: ${details}`);
  }
}

function readComposeSubCommand(value: unknown): ComposeSubCommand {
  if (typeof value !== 'string' || !composeSubCommands.has(value as ComposeSubCommand)) {
    throw new LocalUiHttpError(400, 'invalid-command', 'Command request must include a valid Docker Compose command.');
  }

  return value as ComposeSubCommand;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new LocalUiHttpError(400, 'invalid-string-array', 'Expected an array of strings.');
  }

  return value;
}

function readOptionalString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new LocalUiHttpError(400, 'invalid-string', 'Expected a non-empty string value.');
  }

  return value;
}

function readOptionalStringQuery(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name);

  if (value === null || value.trim().length === 0) {
    return undefined;
  }

  return value;
}

function readOptionalIntegerQuery(url: URL, name: string): number | undefined {
  const value = readOptionalStringQuery(url, name);

  if (value === undefined) {
    return undefined;
  }

  const parsedValue = Number.parseInt(value, 10);

  if (Number.isNaN(parsedValue) || parsedValue < 0) {
    throw new LocalUiHttpError(400, 'invalid-query', `${name} must be a positive integer or zero.`);
  }

  return parsedValue;
}

function readBooleanQuery(url: URL, name: string): boolean | undefined {
  const value = readOptionalStringQuery(url, name);

  if (value === undefined) {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new LocalUiHttpError(400, 'invalid-query', `${name} must be true or false.`);
}

function matchStackRuntimePath(pathname: string): string | undefined {
  const match = /^\/api\/stacks\/([^/]+)\/runtime$/.exec(pathname);
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
}

function findProject(projects: DiscoveredComposeProject[], id: string): DiscoveredComposeProject | undefined {
  return projects.find((project) => project.id === id || project.relativePath === id || project.composeFilePath === id);
}

function isAuthorized(request: IncomingMessage, url: URL, token: string): boolean {
  if (url.searchParams.get('token') === token) {
    return true;
  }

  return request.headers.authorization === `Bearer ${token}`;
}

function sendHtml(response: ServerResponse, content: string): void {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(content);
}

function sendStatic(response: ServerResponse, content: Buffer, contentType: string): void {
  response.writeHead(200, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(content);
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

function sendError(response: ServerResponse, statusCode: number, code: string, message: string): void {
  sendJson(response, statusCode, {
    error: {
      code,
      message,
    },
  });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    const handleError = (error: Error) => {
      server.off('listening', handleListening);
      rejectListen(error);
    };
    const handleListening = () => {
      server.off('error', handleError);
      resolveListen();
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, host);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error !== undefined) {
        rejectClose(error);
        return;
      }

      resolveClose();
    });
  });
}

function isAddressInfo(value: ReturnType<Server['address']>): value is AddressInfo {
  return typeof value === 'object' && value !== null && 'port' in value;
}

async function openLocalBrowser(url: string): Promise<void> {
  const platform = getPlatform();
  const command = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];

  await new Promise<void>((resolveOpen) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.on('error', () => resolveOpen());
    child.unref();
    resolveOpen();
  });
}

class LocalUiHttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'LocalUiHttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
