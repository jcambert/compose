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
import { ComposeProjectError, ComposeYamlError } from '../utils/errors.js';
import { executeComposeApplicationCommand, previewComposeApplicationCommand } from './compose-command-service.js';
import {
  commitComposeServiceMutation,
  listComposeServices,
  previewCreateComposeService,
  previewDeleteComposeService,
  previewUpdateComposeService,
  type CommitComposeServiceMutationInput,
  type ComposeServiceListResult,
  type ComposeServiceMutationCommitResult,
  type PreviewCreateComposeServiceInput,
  type PreviewDeleteComposeServiceInput,
  type PreviewUpdateComposeServiceInput,
} from './compose-editing-service.js';
import type { ComposeServiceMutationPreview } from '../yaml/compose-service-editor.js';
import type {
  ComposeApplicationCommandInput,
  ComposeApplicationCommandOptions,
  ComposeApplicationCommandResult,
} from './compose-command-service.js';
import {
  commitStackDocument,
  deleteStackDocument,
  previewStackCreation,
  previewStackDocumentUpdate,
  readStackDocument,
  StackDocumentConflictError,
  type CommitStackDocumentInput,
  type DeleteStackDocumentInput,
  type DeleteStackDocumentResult,
  type PreviewStackCreationInput,
  type PreviewStackDocumentUpdateInput,
  type StackDocument,
  type StackDocumentPreview,
} from './stack-document-service.js';
import { runDoctor } from './doctor-service.js';
import type { DoctorOptions, DoctorReport } from './doctor-service.js';
import { scanComposeProjects } from './scan-service.js';
import {
  addWorkspaceEntry,
  listWorkspaceEntries,
  removeWorkspaceEntry,
  setCurrentWorkspace,
} from './workspace-service.js';
import type { WorkspaceListResult, WorkspaceMutationInput, WorkspaceNameInput } from './workspace-service.js';

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

export type LocalUiLogStreamInput = {
  project: DiscoveredComposeProject;
  serviceName?: string | undefined;
  tail: string;
  signal: AbortSignal;
};

export type LocalUiLogStreamEvent =
  | {
    stream: 'stdout' | 'stderr';
    content: string;
  }
  | {
    stream: 'exit';
    exitCode: number | null;
    signal: string | null;
  };

export type LocalUiServerDependencies = {
  openBrowser?: (url: string) => Promise<void> | void;
  runDoctor?: (options?: DoctorOptions) => Promise<DoctorReport>;
  listWorkspaces?: () => Promise<WorkspaceListResult>;
  addWorkspace?: (input: WorkspaceMutationInput) => Promise<unknown>;
  setWorkspace?: (input: WorkspaceNameInput) => Promise<unknown>;
  removeWorkspace?: (input: WorkspaceNameInput) => Promise<unknown>;
  scanProjects?: (input: { root?: string; maxDepth?: number }) => Promise<DiscoveredComposeProject[]>;
  readRuntimeStatus?: (project: DiscoveredComposeProject) => Promise<StackRuntimeStatus>;
  streamLogs?: (input: LocalUiLogStreamInput) => AsyncIterable<LocalUiLogStreamEvent>;
  previewCommand?: (input: ComposeApplicationCommandInput) => Promise<BuiltComposeCommand>;
  executeCommand?: (input: ComposeApplicationCommandInput) => Promise<ComposeApplicationCommandResult>;
  listComposeServices?: (input: { composeFilePath: string }) => Promise<ComposeServiceListResult>;
  previewCreateComposeService?: (input: PreviewCreateComposeServiceInput) => Promise<ComposeServiceMutationPreview>;
  previewUpdateComposeService?: (input: PreviewUpdateComposeServiceInput) => Promise<ComposeServiceMutationPreview>;
  previewDeleteComposeService?: (input: PreviewDeleteComposeServiceInput) => Promise<ComposeServiceMutationPreview>;
  commitComposeServiceMutation?: (input: CommitComposeServiceMutationInput) => Promise<ComposeServiceMutationCommitResult>;
  readStackDocument?: (composeFilePath: string) => Promise<StackDocument>;
  previewStackDocumentUpdate?: (input: PreviewStackDocumentUpdateInput) => Promise<StackDocumentPreview>;
  previewStackCreation?: (input: PreviewStackCreationInput) => Promise<StackDocumentPreview>;
  commitStackDocument?: (input: CommitStackDocumentInput) => Promise<StackDocument>;
  deleteStackDocument?: (input: DeleteStackDocumentInput) => Promise<DeleteStackDocumentResult>;
};

type RuntimeDependencies = {
  openBrowser: (url: string) => Promise<void> | void;
  runDoctor: (options?: DoctorOptions) => Promise<DoctorReport>;
  listWorkspaces: () => Promise<WorkspaceListResult>;
  addWorkspace: (input: WorkspaceMutationInput) => Promise<unknown>;
  setWorkspace: (input: WorkspaceNameInput) => Promise<unknown>;
  removeWorkspace: (input: WorkspaceNameInput) => Promise<unknown>;
  scanProjects: (input: { root?: string; maxDepth?: number }) => Promise<DiscoveredComposeProject[]>;
  readRuntimeStatus: (project: DiscoveredComposeProject) => Promise<StackRuntimeStatus>;
  streamLogs: (input: LocalUiLogStreamInput) => AsyncIterable<LocalUiLogStreamEvent>;
  previewCommand: (input: ComposeApplicationCommandInput) => Promise<BuiltComposeCommand>;
  executeCommand: (input: ComposeApplicationCommandInput) => Promise<ComposeApplicationCommandResult>;
  listComposeServices: (input: { composeFilePath: string }) => Promise<ComposeServiceListResult>;
  previewCreateComposeService: (input: PreviewCreateComposeServiceInput) => Promise<ComposeServiceMutationPreview>;
  previewUpdateComposeService: (input: PreviewUpdateComposeServiceInput) => Promise<ComposeServiceMutationPreview>;
  previewDeleteComposeService: (input: PreviewDeleteComposeServiceInput) => Promise<ComposeServiceMutationPreview>;
  commitComposeServiceMutation: (input: CommitComposeServiceMutationInput) => Promise<ComposeServiceMutationCommitResult>;
  readStackDocument: (composeFilePath: string) => Promise<StackDocument>;
  previewStackDocumentUpdate: (input: PreviewStackDocumentUpdateInput) => Promise<StackDocumentPreview>;
  previewStackCreation: (input: PreviewStackCreationInput) => Promise<StackDocumentPreview>;
  commitStackDocument: (input: CommitStackDocumentInput) => Promise<StackDocument>;
  deleteStackDocument: (input: DeleteStackDocumentInput) => Promise<DeleteStackDocumentResult>;
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
  await activateRequestedWorkspace(options.workspaceName, runtimeDependencies);
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

    if (request.method === 'POST' && url.pathname === '/api/workspaces') {
      await context.dependencies.addWorkspace(parseWorkspaceMutationPayload(await readRequestJson(request)));
      sendJson(response, 200, await context.dependencies.listWorkspaces());
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/workspaces/current') {
      await context.dependencies.setWorkspace(parseWorkspaceNamePayload(await readRequestJson(request)));
      sendJson(response, 200, await context.dependencies.listWorkspaces());
      return;
    }

    const workspaceNameToRemove = matchWorkspacePath(url.pathname);

    if (request.method === 'DELETE' && workspaceNameToRemove !== undefined) {
      await context.dependencies.removeWorkspace({ name: workspaceNameToRemove });
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

    if (request.method === 'POST' && url.pathname === '/api/stacks/preview') {
      const scanContext = await resolveStackScanContext(url, context);
      const payload = parseStackCreationPayload(await readRequestJson(request), scanContext.root);
      sendJson(
        response,
        200,
        await context.dependencies.previewStackCreation(payload),
      );
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/stacks/commit') {
      const scanContext = await resolveStackScanContext(url, context);
      const payload = parseStackDocumentCommitPayload(await readRequestJson(request));
      if (payload.preview.operation !== 'create') {
        throw new LocalUiHttpError(400, 'invalid-preview', 'Stack creation requires a create preview.');
      }

      sendJson(
        response,
        200,
        await context.dependencies.commitStackDocument({ ...payload, workspaceRoot: scanContext.root }),
      );
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/events/runtime') {
      await streamRuntimeEvents(request, response, context, await resolveProjectFromQuery(url, context), url);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/logs/stream') {
      await streamLogEvents(request, response, context, await resolveProjectFromQuery(url, context), url);
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

    const stackDocumentMatch = matchStackDocumentPath(url.pathname);

    if (stackDocumentMatch !== undefined) {
      const scanContext = await resolveStackScanContext(url, context);
      const stacks = await scanProjects(scanContext, context.dependencies);
      const project = findProject(stacks, stackDocumentMatch.stackId);

      if (project === undefined) {
        sendError(response, 404, 'stack-not-found', 'Stack not found: ' + stackDocumentMatch.stackId);
        return;
      }

      if (request.method === 'GET' && stackDocumentMatch.action === 'read') {
        sendJson(response, 200, await context.dependencies.readStackDocument(project.composeFilePath));
        return;
      }

      if (request.method === 'POST' && stackDocumentMatch.action === 'preview') {
        const payload = parseStackDocumentUpdatePayload(
          await readRequestJson(request),
          project.composeFilePath,
        );
        sendJson(response, 200, await context.dependencies.previewStackDocumentUpdate(payload));
        return;
      }

      if (request.method === 'POST' && stackDocumentMatch.action === 'commit') {
        const payload = parseStackDocumentCommitPayload(await readRequestJson(request));
        if (payload.preview.operation !== 'update') {
          throw new LocalUiHttpError(400, 'invalid-preview', 'Stack update requires an update preview.');
        }
        sendJson(
          response,
          200,
          await context.dependencies.commitStackDocument({
            ...payload,
            composeFilePath: project.composeFilePath,
          }),
        );
        return;
      }

      if (request.method === 'POST' && stackDocumentMatch.action === 'delete') {
        const payload = parseStackDocumentDeletePayload(
          await readRequestJson(request),
          project.composeFilePath,
        );
        sendJson(response, 200, await context.dependencies.deleteStackDocument(payload));
        return;
      }
    }

    const serviceEditingMatch = matchStackServicesPath(url.pathname);

    if (serviceEditingMatch !== undefined) {
      const scanContext = await resolveStackScanContext(url, context);
      const stacks = await scanProjects(scanContext, context.dependencies);
      const project = findProject(stacks, serviceEditingMatch.stackId);

      if (project === undefined) {
        sendError(response, 404, 'stack-not-found', `Stack not found: ${serviceEditingMatch.stackId}`);
        return;
      }

      if (request.method === 'GET' && serviceEditingMatch.action === 'list') {
        sendJson(response, 200, await context.dependencies.listComposeServices({ composeFilePath: project.composeFilePath }));
        return;
      }

      if (request.method === 'POST' && serviceEditingMatch.action === 'preview') {
        const payload = parseServiceMutationPayload(await readRequestJson(request), project.composeFilePath);
        const preview = payload.operation === 'create'
          ? await context.dependencies.previewCreateComposeService(payload.input)
          : payload.operation === 'update'
            ? await context.dependencies.previewUpdateComposeService(payload.input)
            : await context.dependencies.previewDeleteComposeService(payload.input);
        sendJson(response, 200, preview);
        return;
      }

      if (request.method === 'POST' && serviceEditingMatch.action === 'commit') {
        const payload = parseServiceCommitPayload(await readRequestJson(request));
        sendJson(response, 200, await context.dependencies.commitComposeServiceMutation(payload));
        return;
      }
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

    if (error instanceof StackDocumentConflictError) {
      sendError(response, 409, 'stack-document-conflict', error.message);
      return;
    }

    if (error instanceof ComposeProjectError || error instanceof ComposeYamlError) {
      sendError(response, 400, 'invalid-compose-document', error.message);
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
    addWorkspace: dependencies.addWorkspace ?? addWorkspaceEntry,
    setWorkspace: dependencies.setWorkspace ?? setCurrentWorkspace,
    removeWorkspace: dependencies.removeWorkspace ?? removeWorkspaceEntry,
    scanProjects: dependencies.scanProjects ?? scanComposeProjects,
    readRuntimeStatus: dependencies.readRuntimeStatus ?? ((project) => readStackRuntimeStatus(project, {})),
    streamLogs: dependencies.streamLogs ?? streamComposeLogs,
    previewCommand: dependencies.previewCommand ?? ((input) => previewComposeApplicationCommand(input)),
    executeCommand: dependencies.executeCommand ?? ((input) => executeComposeApplicationCommand(input, { processRunner: captureProcessRunner })),
    listComposeServices: dependencies.listComposeServices ?? listComposeServices,
    previewCreateComposeService: dependencies.previewCreateComposeService ?? previewCreateComposeService,
    previewUpdateComposeService: dependencies.previewUpdateComposeService ?? previewUpdateComposeService,
    previewDeleteComposeService: dependencies.previewDeleteComposeService ?? previewDeleteComposeService,
    commitComposeServiceMutation: dependencies.commitComposeServiceMutation ?? commitComposeServiceMutation,
    readStackDocument: dependencies.readStackDocument ?? readStackDocument,
    previewStackDocumentUpdate: dependencies.previewStackDocumentUpdate ?? previewStackDocumentUpdate,
    previewStackCreation: dependencies.previewStackCreation ?? previewStackCreation,
    commitStackDocument: dependencies.commitStackDocument ?? commitStackDocument,
    deleteStackDocument: dependencies.deleteStackDocument ?? deleteStackDocument,
  };
}

async function activateRequestedWorkspace(
  workspaceName: string | undefined,
  dependencies: RuntimeDependencies,
): Promise<void> {
  if (workspaceName === undefined) {
    return;
  }

  const workspaces = await dependencies.listWorkspaces();
  const workspaceExists = workspaces.workspaces.some((workspace) => workspace.name === workspaceName);

  if (!workspaceExists) {
    throw new Error(`Workspace not found: ${workspaceName}`);
  }

  await dependencies.setWorkspace({ name: workspaceName });
}

async function resolveStackScanContext(url: URL, context: RequestContext): Promise<StackScanContext> {
  const root = readOptionalStringQuery(url, 'root');
  const maxDepth = readOptionalIntegerQuery(url, 'maxDepth');

  if (root !== undefined) {
    return { root, ...(maxDepth === undefined ? {} : { maxDepth }) };
  }

  const workspaceName = readOptionalStringQuery(url, 'workspace');
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

async function resolveProjectFromQuery(url: URL, context: RequestContext): Promise<DiscoveredComposeProject> {
  const stackId = readRequiredStringQuery(url, 'stackId');
  const scanContext = await resolveStackScanContext(url, context);
  const stacks = await scanProjects(scanContext, context.dependencies);
  const project = findProject(stacks, stackId);

  if (project === undefined) {
    throw new LocalUiHttpError(404, 'stack-not-found', `Stack not found: ${stackId}`);
  }

  return project;
}

async function streamRuntimeEvents(
  request: IncomingMessage,
  response: ServerResponse,
  context: RequestContext,
  project: DiscoveredComposeProject,
  url: URL,
): Promise<void> {
  const signal = createRequestAbortSignal(request);
  const intervalMs = normalizeStreamInterval(readOptionalIntegerQuery(url, 'intervalMs') ?? 5_000);

  sendSseHeaders(response);
  writeSseEvent(response, 'connected', { stream: 'runtime', projectId: project.id, intervalMs });

  while (!signal.aborted && !response.destroyed) {
    try {
      writeSseEvent(response, 'runtime', await context.dependencies.readRuntimeStatus(project));
    } catch (error) {
      writeSseEvent(response, 'runtime-error', { message: error instanceof Error ? error.message : 'Runtime stream failed.' });
    }

    await delay(intervalMs, signal);
  }

  if (!response.destroyed) {
    response.end();
  }
}

async function streamLogEvents(
  request: IncomingMessage,
  response: ServerResponse,
  context: RequestContext,
  project: DiscoveredComposeProject,
  url: URL,
): Promise<void> {
  const signal = createRequestAbortSignal(request);
  const serviceName = readOptionalStringQuery(url, 'service');
  const tail = String(readOptionalIntegerQuery(url, 'tail') ?? 200);

  sendSseHeaders(response);
  writeSseEvent(response, 'connected', { stream: 'logs', projectId: project.id, serviceName: serviceName ?? null, tail });

  try {
    for await (const event of context.dependencies.streamLogs({ project, serviceName, tail, signal })) {
      if (signal.aborted || response.destroyed) {
        break;
      }

      if (event.stream === 'exit') {
        writeSseEvent(response, 'logs-complete', event);
        break;
      }

      writeSseEvent(response, 'log', event);
    }
  } catch (error) {
    if (!signal.aborted && !response.destroyed) {
      writeSseEvent(response, 'logs-error', { message: error instanceof Error ? error.message : 'Log stream failed.' });
    }
  }

  if (!response.destroyed) {
    response.end();
  }
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

function parseWorkspaceMutationPayload(value: unknown): WorkspaceMutationInput {
  if (!isObject(value)) {
    throw new LocalUiHttpError(400, 'invalid-json', 'Workspace request body must be a JSON object.');
  }

  return {
    name: readRequiredString(value.name, 'name'),
    path: readRequiredString(value.path, 'path'),
  };
}

function parseWorkspaceNamePayload(value: unknown): WorkspaceNameInput {
  if (!isObject(value)) {
    throw new LocalUiHttpError(400, 'invalid-json', 'Workspace request body must be a JSON object.');
  }

  return {
    name: readRequiredString(value.name, 'name'),
  };
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

type ParsedServiceMutation =
  | { operation: 'create'; input: PreviewCreateComposeServiceInput }
  | { operation: 'update'; input: PreviewUpdateComposeServiceInput }
  | { operation: 'delete'; input: PreviewDeleteComposeServiceInput };

function parseServiceMutationPayload(value: unknown, composeFilePath: string): ParsedServiceMutation {
  if (!isObject(value)) {
    throw new LocalUiHttpError(400, 'invalid-json', 'Service mutation request body must be a JSON object.');
  }

  const operation = readRequiredString(value.operation, 'operation');

  if (operation === 'create') {
    if (!isObject(value.service)) {
      throw new LocalUiHttpError(400, 'invalid-service', 'Create operation requires a service object.');
    }

    return {
      operation,
      input: {
        composeFilePath,
        service: value.service as PreviewCreateComposeServiceInput['service'],
        overwrite: value.overwrite === true,
      },
    };
  }

  if (operation === 'update') {
    if (!isObject(value.patch)) {
      throw new LocalUiHttpError(400, 'invalid-service-patch', 'Update operation requires a patch object.');
    }

    return {
      operation,
      input: {
        composeFilePath,
        serviceName: readRequiredString(value.serviceName, 'serviceName'),
        patch: value.patch as PreviewUpdateComposeServiceInput['patch'],
      },
    };
  }

  if (operation === 'delete') {
    return {
      operation,
      input: {
        composeFilePath,
        serviceName: readRequiredString(value.serviceName, 'serviceName'),
      },
    };
  }

  throw new LocalUiHttpError(400, 'invalid-operation', 'Service operation must be create, update or delete.');
}

function parseServiceCommitPayload(value: unknown): CommitComposeServiceMutationInput {
  if (!isObject(value) || !isObject(value.preview)) {
    throw new LocalUiHttpError(400, 'invalid-preview', 'Commit request requires a preview object.');
  }

  return { preview: value.preview as unknown as ComposeServiceMutationPreview };
}

function parseStackDocumentUpdatePayload(
  value: unknown,
  composeFilePath: string,
): PreviewStackDocumentUpdateInput {
  if (!isObject(value)) {
    throw new LocalUiHttpError(400, 'invalid-json', 'Stack document request body must be a JSON object.');
  }

  return {
    composeFilePath,
    yaml: readDocumentText(value.yaml, 'yaml', false),
    env: readDocumentText(value.env, 'env', true),
  };
}

function parseStackCreationPayload(
  value: unknown,
  workspaceRoot: string,
): PreviewStackCreationInput {
  if (!isObject(value)) {
    throw new LocalUiHttpError(400, 'invalid-json', 'Stack creation request body must be a JSON object.');
  }

  return {
    workspaceRoot,
    stackName: readRequiredString(value.stackName, 'stackName'),
    yaml: readDocumentText(value.yaml, 'yaml', false),
    env: readDocumentText(value.env, 'env', true),
  };
}

function parseStackDocumentCommitPayload(value: unknown): Pick<CommitStackDocumentInput, 'preview'> {
  if (!isObject(value) || !isObject(value.preview)) {
    throw new LocalUiHttpError(400, 'invalid-preview', 'Stack commit request requires a preview object.');
  }

  return { preview: value.preview as unknown as StackDocumentPreview };
}

function parseStackDocumentDeletePayload(
  value: unknown,
  composeFilePath: string,
): DeleteStackDocumentInput {
  if (!isObject(value)) {
    throw new LocalUiHttpError(400, 'invalid-json', 'Stack deletion request body must be a JSON object.');
  }

  return {
    composeFilePath,
    expectedContentHash: readRequiredString(value.expectedContentHash, 'expectedContentHash'),
    expectedEnvContentHash: readRequiredString(value.expectedEnvContentHash, 'expectedEnvContentHash'),
    confirmedStackName: readRequiredString(value.confirmedStackName, 'confirmedStackName'),
  };
}

function readDocumentText(value: unknown, fieldName: string, allowEmpty: boolean): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    const qualifier = allowEmpty ? 'a string' : 'a non-empty string';
    throw new LocalUiHttpError(400, 'invalid-string', fieldName + ' must be ' + qualifier + '.');
  }

  return value;
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

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new LocalUiHttpError(400, 'invalid-string', `${fieldName} must be a non-empty string.`);
  }

  return value.trim();
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

function readRequiredStringQuery(url: URL, name: string): string {
  const value = readOptionalStringQuery(url, name);

  if (value === undefined) {
    throw new LocalUiHttpError(400, 'invalid-query', `${name} must be provided.`);
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

function matchWorkspacePath(pathname: string): string | undefined {
  const match = /^\/api\/workspaces\/([^/]+)$/.exec(pathname);
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
}

function matchStackRuntimePath(pathname: string): string | undefined {
  const match = /^\/api\/stacks\/([^/]+)\/runtime$/.exec(pathname);
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
}

type StackDocumentRoute = {
  stackId: string;
  action: 'read' | 'preview' | 'commit' | 'delete';
};

function matchStackDocumentPath(pathname: string): StackDocumentRoute | undefined {
  const match = /^\/api\/stacks\/([^/]+)\/compose(?:\/(preview|commit|delete))?$/.exec(pathname);
  if (match?.[1] === undefined) {
    return undefined;
  }

  const action = match[2];

  return {
    stackId: decodeURIComponent(match[1]),
    action: action === 'preview' || action === 'commit' || action === 'delete'
      ? action
      : 'read',
  };
}

type StackServicesRoute = {
  stackId: string;
  action: 'list' | 'preview' | 'commit';
};

function matchStackServicesPath(pathname: string): StackServicesRoute | undefined {
  const match = /^\/api\/stacks\/([^/]+)\/services(?:\/(preview|commit))?$/.exec(pathname);
  if (match?.[1] === undefined) {
    return undefined;
  }

  return {
    stackId: decodeURIComponent(match[1]),
    action: match[2] === 'preview' || match[2] === 'commit' ? match[2] : 'list',
  };
}

function findProject(projects: DiscoveredComposeProject[], id: string): DiscoveredComposeProject | undefined {
  return projects.find((project) => project.id === id || project.relativePath === id || project.composeFilePath === id);
}

async function* streamComposeLogs(input: LocalUiLogStreamInput): AsyncIterable<LocalUiLogStreamEvent> {
  const args = ['compose', '-f', input.project.composeFilePath, 'logs', '--follow', '--tail', input.tail];

  if (input.serviceName !== undefined) {
    args.push(input.serviceName);
  }

  const child = spawn('docker', args, {
    cwd: input.project.directoryPath,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const queue: LocalUiLogStreamEvent[] = [];
  let completed = false;
  let wake: (() => void) | undefined;
  const push = (event: LocalUiLogStreamEvent) => {
    queue.push(event);
    wake?.();
    wake = undefined;
  };
  const abort = () => {
    if (!child.killed) {
      child.kill();
    }
  };

  child.stdout.on('data', (chunk: Buffer) => push({ stream: 'stdout', content: chunk.toString('utf-8') }));
  child.stderr.on('data', (chunk: Buffer) => push({ stream: 'stderr', content: chunk.toString('utf-8') }));
  child.on('error', (error) => push({ stream: 'stderr', content: error.message }));
  child.on('close', (exitCode, signal) => {
    completed = true;
    push({ stream: 'exit', exitCode, signal });
  });
  input.signal.addEventListener('abort', abort, { once: true });

  try {
    while (!input.signal.aborted) {
      if (queue.length === 0) {
        if (completed) {
          return;
        }

        await new Promise<void>((resolveWait) => {
          wake = resolveWait;
        });
      }

      while (queue.length > 0) {
        const event = queue.shift();

        if (event === undefined) {
          continue;
        }

        yield event;

        if (event.stream === 'exit') {
          return;
        }
      }
    }
  } finally {
    input.signal.removeEventListener('abort', abort);

    if (!completed && !child.killed) {
      child.kill();
    }
  }
}

function createRequestAbortSignal(request: IncomingMessage): AbortSignal {
  const controller = new AbortController();
  request.on('close', () => controller.abort());
  return controller.signal;
}

function normalizeStreamInterval(value: number): number {
  return Math.min(60_000, Math.max(1_000, value));
}

function sendSseHeaders(response: ServerResponse): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-content-type-options': 'nosniff',
  });
  response.flushHeaders();
}

function writeSseEvent(response: ServerResponse, event: string, value: unknown): void {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(value)}\n\n`);
}

async function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return;
  }

  await new Promise<void>((resolveDelay) => {
    const timeout = setTimeout(resolveDelay, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timeout);
      resolveDelay();
    }, { once: true });
  });
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
