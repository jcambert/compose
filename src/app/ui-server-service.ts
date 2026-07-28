import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { platform as getPlatform } from 'node:os';
import { URL } from 'node:url';
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

      sendHtml(response, createReactIndexHtml(context.token));
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

function createReactIndexHtml(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>compose UI</title>
  <script>window.__COMPOSE_UI_TOKEN__=${JSON.stringify(token)};</script>
  <style>
    :root { color: #e5e7eb; background: #0f172a; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; min-height: 100vh; background: radial-gradient(circle at top left, rgba(59,130,246,.26), transparent 36rem), #0f172a; }
    button, select, input { font: inherit; }
    button, select { border: 1px solid #334155; border-radius: .75rem; background: #111827; color: #f8fafc; }
    button { cursor: pointer; padding: .75rem 1rem; background: #2563eb; border-color: #2563eb; font-weight: 700; }
    button:disabled { cursor: not-allowed; opacity: .55; }
    button.secondary { background: #1f2937; border-color: #475569; }
    button.danger { background: #dc2626; border-color: #dc2626; }
    select { padding: .7rem .85rem; width: 100%; }
    label { display: grid; gap: .45rem; color: #cbd5e1; font-size: .9rem; font-weight: 700; }
    pre { white-space: pre-wrap; word-break: break-word; }
    .app-shell { width: min(1440px, calc(100vw - 2rem)); margin: 0 auto; padding: 2rem 0 4rem; }
    .hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 1.5rem; margin-bottom: 1.5rem; padding: 1.5rem; border: 1px solid rgba(148,163,184,.25); border-radius: 1.5rem; background: rgba(15,23,42,.82); box-shadow: 0 24px 80px rgba(0,0,0,.35); }
    .hero h1 { margin: .2rem 0 .35rem; font-size: clamp(2.2rem, 5vw, 4.8rem); line-height: .95; }
    .eyebrow { margin: 0; color: #60a5fa; font-size: .8rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .muted { color: #94a3b8; }
    .grid { display: grid; gap: 1rem; margin-bottom: 1rem; }
    .two-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .wide-left { grid-template-columns: minmax(0, .92fr) minmax(0, 1.08fr); }
    .panel, .banner, .code-block { border: 1px solid rgba(148,163,184,.22); border-radius: 1rem; background: rgba(15,23,42,.78); box-shadow: 0 16px 48px rgba(0,0,0,.24); }
    .panel { padding: 1rem; }
    .panel-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; }
    .panel-header h2 { margin: 0; font-size: 1.1rem; }
    .panel-header span { max-width: 58%; color: #94a3b8; font-size: .85rem; text-align: right; }
    .banner { margin-bottom: 1rem; padding: .85rem 1rem; }
    .banner.info { border-color: rgba(59,130,246,.42); color: #bfdbfe; }
    .banner.warning { border-color: rgba(234,179,8,.45); color: #fde68a; }
    .banner.danger { border-color: rgba(248,113,113,.45); color: #fecaca; }
    .status-pill { display: inline-flex; width: fit-content; align-items: center; border-radius: 999px; padding: .35rem .75rem; font-size: .82rem; font-weight: 800; }
    .status-pill.ok { background: rgba(22,163,74,.16); color: #86efac; }
    .status-pill.warning { background: rgba(234,179,8,.16); color: #fde68a; }
    .status-pill.danger { background: rgba(220,38,38,.18); color: #fecaca; }
    .check-list, .list, .stack-list, .service-grid { display: grid; gap: .75rem; }
    .check-row, .list-item, .service-card, .stack-card { display: grid; gap: .25rem; padding: .85rem; border: 1px solid rgba(148,163,184,.18); border-radius: .85rem; background: rgba(15,23,42,.72); }
    .check-row span, .list-item span, .service-card span, .stack-card span, small { color: #94a3b8; }
    .check-row.ok { border-color: rgba(22,163,74,.35); }
    .check-row.warning { border-color: rgba(234,179,8,.38); }
    .check-row.error { border-color: rgba(220,38,38,.42); }
    .stack-card { width: 100%; text-align: left; background: rgba(15,23,42,.72); }
    .stack-card.selected { border-color: #60a5fa; box-shadow: inset 0 0 0 1px rgba(96,165,250,.65); }
    .status-line, .actions, .checkbox-row { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; margin-bottom: 1rem; }
    .service-grid { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
    .command-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-bottom: 1rem; }
    .checkbox-row label { display: flex; align-items: center; gap: .45rem; }
    .code-block { margin-top: 1rem; padding: 1rem; }
    .code-block pre { margin-bottom: 0; color: #dbeafe; }
    .danger-text { color: #fecaca; }
    @media (max-width: 900px) { .hero, .panel-header { display: grid; } .panel-header span { max-width: none; text-align: left; } .two-columns, .wide-left, .command-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    import React, { useEffect, useMemo, useState } from 'https://esm.sh/react@19.2.7';
    import { createRoot } from 'https://esm.sh/react-dom@19.2.7/client';

    const h = React.createElement;
    const token = window.__COMPOSE_UI_TOKEN__;
    const commands = ['ps', 'up', 'down', 'logs', 'restart', 'stop', 'start', 'build', 'pull', 'kill', 'rm'];
    const destructiveCommands = new Set(['down', 'kill', 'rm']);

    function api(path, options) {
      return fetch(path, {
        ...options,
        headers: {
          authorization: 'Bearer ' + token,
          ...(options && options.headers ? options.headers : {})
        }
      }).then(async response => {
        const value = await response.json();
        if (!response.ok) {
          throw new Error(value.error && value.error.message ? value.error.message : 'HTTP ' + response.status);
        }
        return value;
      });
    }

    function App() {
      const [state, setState] = useState({ loading: true });
      const [selectedId, setSelectedId] = useState(undefined);
      const [runtime, setRuntime] = useState({ loading: false });
      const [form, setForm] = useState({ command: 'ps', serviceName: '', confirmed: false, destructiveConfirmed: false, busy: false });
      const selectedProject = useMemo(() => (state.stacks && state.stacks.stacks ? state.stacks.stacks.find(project => project.id === selectedId) : undefined), [state.stacks, selectedId]);

      async function load() {
        setState({ loading: true });
        try {
          const [health, doctor, workspaces, stacks] = await Promise.all([
            api('/api/health'),
            api('/api/doctor?skipDocker=true'),
            api('/api/workspaces'),
            api('/api/stacks')
          ]);
          setState({ loading: false, health, doctor, workspaces, stacks });
          setSelectedId(current => current || (stacks.stacks[0] && stacks.stacks[0].id));
        } catch (error) {
          setState({ loading: false, error: error instanceof Error ? error.message : 'Unable to load compose data.' });
        }
      }

      useEffect(() => { void load(); }, []);

      useEffect(() => {
        if (!selectedProject) {
          setRuntime({ loading: false });
          return;
        }
        let cancelled = false;
        setRuntime({ loading: true });
        api('/api/stacks/' + encodeURIComponent(selectedProject.id) + '/runtime')
          .then(status => { if (!cancelled) setRuntime({ loading: false, status }); })
          .catch(error => { if (!cancelled) setRuntime({ loading: false, error: error instanceof Error ? error.message : 'Runtime unavailable.' }); });
        return () => { cancelled = true; };
      }, [selectedProject]);

      async function preview() {
        const request = createRequest(selectedProject, form);
        if (!request) return;
        setForm(current => ({ ...current, busy: true, error: undefined, preview: undefined, execution: undefined }));
        try {
          const result = await api('/api/commands/preview', postOptions(request));
          setForm(current => ({ ...current, busy: false, preview: result }));
        } catch (error) {
          setForm(current => ({ ...current, busy: false, error: error instanceof Error ? error.message : 'Unable to preview command.' }));
        }
      }

      async function execute() {
        const request = createRequest(selectedProject, form);
        if (!request) return;
        setForm(current => ({ ...current, busy: true, error: undefined, execution: undefined }));
        try {
          const result = await api('/api/commands/execute', postOptions(request));
          setForm(current => ({ ...current, busy: false, execution: result }));
        } catch (error) {
          setForm(current => ({ ...current, busy: false, error: error instanceof Error ? error.message : 'Unable to execute command.' }));
        }
      }

      const destructive = destructiveCommands.has(form.command);
      const canExecute = form.preview && form.confirmed && (!destructive || form.destructiveConfirmed);
      return h('main', { className: 'app-shell' },
        h('header', { className: 'hero' },
          h('div', null,
            h('p', { className: 'eyebrow' }, 'CLI-first · local-only · token-protected'),
            h('h1', null, 'compose UI'),
            h('p', { className: 'muted' }, 'React MVP for diagnostics, workspaces, stacks and safe Docker Compose command previews.')
          ),
          h('button', { className: 'secondary', type: 'button', onClick: load, disabled: state.loading }, 'Refresh')
        ),
        state.error ? h(Banner, { tone: 'danger' }, state.error) : null,
        state.loading ? h(Banner, { tone: 'info' }, 'Loading local compose data...') : null,
        h('section', { className: 'grid two-columns' }, h(DoctorPanel, { report: state.doctor }), h(WorkspacePanel, { workspaces: state.workspaces, health: state.health })),
        h('section', { className: 'grid two-columns wide-left' },
          h(StackListPanel, { stacks: state.stacks, selectedId, onSelect: id => { setSelectedId(id); setForm(current => ({ ...current, serviceName: '', preview: undefined, execution: undefined, error: undefined })); } }),
          h(StackDetailPanel, { project: selectedProject, runtime })
        ),
        h(CommandPanel, { project: selectedProject, form, setForm, destructive, canExecute, preview, execute })
      );
    }

    function DoctorPanel({ report }) {
      const checks = report && report.checks ? report.checks : [];
      return h(Panel, { title: 'Doctor', subtitle: 'Local diagnostics' },
        report ? h(StatusPill, { tone: report.ok ? 'ok' : 'danger' }, report.ok ? 'OK' : 'Issues found') : h('p', { className: 'muted' }, 'No diagnostic report loaded.'),
        h('div', { className: 'check-list' }, checks.length === 0 ? h('p', { className: 'muted' }, 'No checks returned.') : checks.map(check => h('article', { key: check.id, className: 'check-row ' + check.status }, h('strong', null, check.name), h('span', null, check.message), check.details ? h('small', null, check.details) : null)))
      );
    }

    function WorkspacePanel({ workspaces, health }) {
      const entries = workspaces && workspaces.workspaces ? workspaces.workspaces : [];
      return h(Panel, { title: 'Workspaces', subtitle: health ? 'Server ' + health.host : 'Local server' },
        workspaces && workspaces.currentWorkspaceName ? h(StatusPill, { tone: 'ok' }, 'Current: ' + workspaces.currentWorkspaceName) : h('p', { className: 'muted' }, 'No current workspace configured.'),
        h('div', { className: 'list' }, entries.length === 0 ? h('p', { className: 'muted' }, 'No workspace saved yet.') : entries.map(workspace => h('article', { key: workspace.name, className: 'list-item' }, h('strong', null, workspace.name), h('span', null, workspace.path))))
      );
    }

    function StackListPanel({ stacks, selectedId, onSelect }) {
      const projects = stacks && stacks.stacks ? stacks.stacks : [];
      return h(Panel, { title: 'Stacks', subtitle: stacks ? projects.length + ' stacks · ' + stacks.root : 'Compose projects' },
        h('div', { className: 'stack-list' }, projects.length === 0 ? h('p', { className: 'muted' }, 'No Compose stack found.') : projects.map(project => h('button', { key: project.id, type: 'button', className: project.id === selectedId ? 'stack-card selected' : 'stack-card', onClick: () => onSelect(project.id) }, h('strong', null, project.name), h('span', null, project.services.length + ' services · ' + project.relativePath))))
      );
    }

    function StackDetailPanel({ project, runtime }) {
      const services = project ? project.services : [];
      const status = runtime.status;
      return h(Panel, { title: 'Stack detail', subtitle: project ? project.composeFilePath : 'Select a stack' },
        project ? h(React.Fragment, null,
          h('div', { className: 'status-line' }, h(StatusPill, { tone: status && status.available === false ? 'warning' : 'ok' }, runtime.loading ? 'Loading runtime...' : (status ? status.summary : 'Runtime unknown')), runtime.error ? h('span', { className: 'danger-text' }, runtime.error) : null),
          status && status.warning ? h(Banner, { tone: 'warning' }, status.warning) : null,
          h('div', { className: 'service-grid' }, services.map(service => { const serviceStatus = status && status.services ? status.services[service] : undefined; return h('article', { key: service, className: 'service-card' }, h('strong', null, service), h('span', null, (serviceStatus ? serviceStatus.state : 'unknown') + ' · ' + (serviceStatus ? serviceStatus.containerCount : 0) + ' containers'), serviceStatus && serviceStatus.ports && serviceStatus.ports.length > 0 ? h('small', null, serviceStatus.ports.join(', ')) : null); }))
        ) : h('p', { className: 'muted' }, 'Select a stack to inspect services and runtime status.')
      );
    }

    function CommandPanel({ project, form, setForm, destructive, canExecute, preview, execute }) {
      const services = project ? project.services : [];
      return h(Panel, { title: 'Command preview', subtitle: 'Always inspect the Docker command before execution' },
        project ? null : h('p', { className: 'muted' }, 'Select a stack before previewing a command.'),
        h('div', { className: 'command-grid' },
          h('label', null, 'Command', h('select', { value: form.command, onChange: event => setForm(current => ({ ...current, command: event.target.value, preview: undefined, execution: undefined, error: undefined })) }, commands.map(command => h('option', { key: command, value: command }, command)))),
          h('label', null, 'Service', h('select', { value: form.serviceName, onChange: event => setForm(current => ({ ...current, serviceName: event.target.value, preview: undefined, execution: undefined, error: undefined })) }, h('option', { value: '' }, 'All services / stack level'), services.map(service => h('option', { key: service, value: service }, service))))
        ),
        h('div', { className: 'checkbox-row' },
          h('label', null, h('input', { type: 'checkbox', checked: form.confirmed, onChange: event => setForm(current => ({ ...current, confirmed: event.target.checked })) }), 'I confirm command execution'),
          destructive ? h('label', null, h('input', { type: 'checkbox', checked: form.destructiveConfirmed, onChange: event => setForm(current => ({ ...current, destructiveConfirmed: event.target.checked })) }), 'I understand this is destructive') : null
        ),
        h('div', { className: 'actions' }, h('button', { type: 'button', onClick: preview, disabled: !project || form.busy }, 'Preview command'), h('button', { type: 'button', className: 'danger', onClick: execute, disabled: !canExecute || form.busy }, 'Execute')),
        form.error ? h(Banner, { tone: 'danger' }, form.error) : null,
        form.preview ? h(CodeBlock, { title: 'Generated command' }, form.preview.displayCommand) : null,
        form.execution ? h(CodeBlock, { title: 'Execution result · exit ' + form.execution.exitCode }, [form.execution.stdout, form.execution.stderr].filter(part => part && part.length > 0).join('\n') || form.execution.command) : null
      );
    }

    function createRequest(project, form) {
      if (!project) return undefined;
      const services = form.serviceName.length === 0 ? [] : [form.serviceName];
      const options = form.command === 'up' ? { detach: true, noAnsi: true } : form.command === 'logs' ? { tail: '100', noAnsi: true } : { noAnsi: true };
      return { command: form.command, composeFilePath: project.composeFilePath, services, options, confirmed: form.confirmed, destructiveConfirmed: form.destructiveConfirmed };
    }

    function postOptions(body) { return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }; }
    function Panel({ title, subtitle, children }) { return h('section', { className: 'panel' }, h('div', { className: 'panel-header' }, h('h2', null, title), h('span', null, subtitle)), children); }
    function Banner({ tone, children }) { return h('div', { className: 'banner ' + tone }, children); }
    function StatusPill({ tone, children }) { return h('span', { className: 'status-pill ' + tone }, children); }
    function CodeBlock({ title, children }) { return h('div', { className: 'code-block' }, h('strong', null, title), h('pre', null, children)); }

    createRoot(document.getElementById('root')).render(h(App));
  </script>
</body>
</html>`;
}

async function listen(server: Server, port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function isAddressInfo(address: ReturnType<Server['address']>): address is AddressInfo {
  return typeof address === 'object' && address !== null && typeof address.port === 'number';
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function openLocalBrowser(url: string): void {
  const currentPlatform = getPlatform();
  const command = currentPlatform === 'win32' ? 'cmd' : currentPlatform === 'darwin' ? 'open' : 'xdg-open';
  const args = currentPlatform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

class LocalUiHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LocalUiHttpError';
  }
}
