import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ComposeApplicationCommandInput, ComposeApplicationCommandResult } from '../../src/app/compose-command-service.js';
import { startLocalUiServer } from '../../src/app/ui-server-service.js';
import type { LocalUiServer, LocalUiServerDependencies, LocalUiServerOptions } from '../../src/app/ui-server-service.js';
import type { BuiltComposeCommand } from '../../src/compose/compose-command.js';
import type { StackRuntimeStatus } from '../../src/interactive/stack-runtime-status.js';
import type { DiscoveredComposeProject } from '../../src/scanner/discovered-project.js';
import type { WorkspaceDefinition } from '../../src/workspace/workspace-config.js';
import type { ComposeServiceMutationPreview } from '../../src/yaml/compose-service-editor.js';

const token = 'test-token';
const project: DiscoveredComposeProject = {
  id: 'infra-compose-yaml',
  name: 'infra',
  composeFilePath: '/workspace/infra/compose.yaml',
  directoryPath: '/workspace/infra',
  relativePath: 'infra/compose.yaml',
  services: ['api'],
  warnings: [],
};

const runtimeStatus: StackRuntimeStatus = {
  projectId: project.id,
  composeFilePath: project.composeFilePath,
  available: true,
  state: 'running',
  services: {
    api: {
      serviceName: 'api',
      state: 'running',
      containerCount: 1,
      ports: [],
      containerNames: ['infra-api-1'],
    },
  },
  runningServices: 1,
  stoppedServices: 0,
  unhealthyServices: 0,
  unknownServices: 0,
  summary: '1 running · 0 stopped',
};

function createDependencies(overrides: LocalUiServerDependencies = {}): LocalUiServerDependencies {
  return {
    runDoctor: async () => ({
      ok: true,
      strict: false,
      checks: [],
      exitCode: 0,
    }),
    listWorkspaces: async () => ({
      workspaces: [
        {
          name: 'dev',
          path: '/workspace',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      currentWorkspaceName: 'dev',
    }),
    addWorkspace: async () => undefined,
    setWorkspace: async () => undefined,
    removeWorkspace: async () => undefined,
    scanProjects: async () => [project],
    readRuntimeStatus: async () => runtimeStatus,
    previewCommand: async (input: ComposeApplicationCommandInput): Promise<BuiltComposeCommand> => ({
      binary: 'docker',
      args: ['compose', input.command],
      cwd: '/workspace/infra',
      displayCommand: `docker compose ${input.command}`,
    }),
    listComposeServices: async () => ({
      composeFilePath: project.composeFilePath,
      contentHash: 'hash-before',
      services: [{
        name: 'api', image: 'example/api:latest', ports: ['8080:8080'], environment: [], volumes: [], dependsOn: [], readOnlyKeys: [], preservedKeys: [],
      }],
    }),
    previewCreateComposeService: async (input) => createServicePreview('create', input.service.name),
    previewUpdateComposeService: async (input) => createServicePreview('update', input.serviceName),
    previewDeleteComposeService: async (input) => createServicePreview('delete', input.serviceName),
    commitComposeServiceMutation: async (input) => ({
      composeFilePath: input.preview.composeFilePath, operation: input.preview.operation, serviceName: input.preview.serviceName, contentHash: 'hash-after',
    }),
    executeCommand: async (input: ComposeApplicationCommandInput): Promise<ComposeApplicationCommandResult> => ({
      command: `docker compose ${input.command}`,
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      request: {
        composeFilePath: input.composeFilePath ?? '/workspace/infra/compose.yaml',
        workingDirectory: '/workspace/infra',
        command: input.command,
        services: input.services,
        options: input.options,
        passthroughArgs: input.passthroughArgs ?? [],
      },
      dryRun: input.options.dryRun === true,
    }),
    ...overrides,
  };
}

function createServicePreview(operation: ComposeServiceMutationPreview['operation'], serviceName: string): ComposeServiceMutationPreview {
  return {
    operation, composeFilePath: project.composeFilePath, serviceName, originalContentHash: 'hash-before',
    diff: `--- before\n+++ after\n+${serviceName}`, nextContent: `services:\n  ${serviceName}: {}`,
    validation: { success: true, errors: [] }, warnings: [],
  };
}

describe('local UI server application service', () => {
  it('starts a token-protected local server and exposes health, doctor, workspaces and stacks', async () => {
    const server = await startTestServer();

    try {
      const unauthorized = await fetch(apiUrl(server, '/api/health'));
      expect(unauthorized.status).toBe(401);

      const health = await getJson(server, '/api/health');
      const doctor = await getJson(server, '/api/doctor');
      const workspaces = await getJson(server, '/api/workspaces');
      const stacks = await getJson(server, '/api/stacks');

      expect(health).toMatchObject({ ok: true, host: '127.0.0.1' });
      expect(doctor).toMatchObject({ ok: true, exitCode: 0 });
      expect(workspaces).toMatchObject({ currentWorkspaceName: 'dev' });
      expect(stacks).toMatchObject({ root: '/workspace', workspaceName: 'dev' });
      expect((stacks.stacks as DiscoveredComposeProject[])[0]).toMatchObject({ id: 'infra-compose-yaml' });
    } finally {
      await server.close();
    }
  });

  it('activates an explicitly requested CLI workspace before serving stacks', async () => {
    let currentWorkspaceName = 'ia';
    const scannedRoots: string[] = [];
    const workspaces: WorkspaceDefinition[] = [
      {
        name: 'dev',
        path: '/workspace/dev',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        name: 'ia',
        path: '/workspace/ia',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const server = await startTestServer({
      listWorkspaces: async () => ({ workspaces, currentWorkspaceName }),
      setWorkspace: async ({ name }) => {
        currentWorkspaceName = name;
      },
      scanProjects: async ({ root }) => {
        scannedRoots.push(root ?? '.');
        return [project];
      },
    }, { workspaceName: 'dev' });

    try {
      const workspacesResult = await getJson(server, '/api/workspaces');
      const stacks = await getJson(server, '/api/stacks');

      expect(workspacesResult).toMatchObject({ currentWorkspaceName: 'dev' });
      expect(stacks).toMatchObject({ root: '/workspace/dev', workspaceName: 'dev' });
      expect(scannedRoots).toEqual(['/workspace/dev']);
    } finally {
      await server.close();
    }
  });

  it('uses the last active workspace when no CLI workspace is provided', async () => {
    const scannedRoots: string[] = [];
    const server = await startTestServer({
      listWorkspaces: async () => ({
        currentWorkspaceName: 'ia',
        workspaces: [
          {
            name: 'ia',
            path: '/workspace/ia',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
      scanProjects: async ({ root }) => {
        scannedRoots.push(root ?? '.');
        return [project];
      },
    });

    try {
      const stacks = await getJson(server, '/api/stacks');

      expect(stacks).toMatchObject({ root: '/workspace/ia', workspaceName: 'ia' });
      expect(scannedRoots).toEqual(['/workspace/ia']);
    } finally {
      await server.close();
    }
  });

  it('manages workspaces through token-protected local API endpoints', async () => {
    let currentWorkspaceName: string | undefined = 'dev';
    let workspaces: WorkspaceDefinition[] = [
      {
        name: 'dev',
        path: '/workspace',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const server = await startTestServer({
      listWorkspaces: async () => ({
        workspaces,
        ...(currentWorkspaceName === undefined ? {} : { currentWorkspaceName }),
      }),
      addWorkspace: async (input) => {
        workspaces = [
          ...workspaces.filter((workspace) => workspace.name !== input.name),
          {
            name: input.name,
            path: input.path,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ];
      },
      setWorkspace: async (input) => {
        currentWorkspaceName = input.name;
      },
      removeWorkspace: async (input) => {
        workspaces = workspaces.filter((workspace) => workspace.name !== input.name);
        if (currentWorkspaceName === input.name) {
          currentWorkspaceName = workspaces[0]?.name;
        }
      },
    });

    try {
      const created = await postJson(server, '/api/workspaces', { name: 'demo', path: '/workspace/demo' });
      const selected = await postJson(server, '/api/workspaces/current', { name: 'demo' });
      const removed = await deleteJson(server, '/api/workspaces/dev');
      const invalid = await post(server, '/api/workspaces', { name: '', path: '/empty' });

      expect((created.workspaces as WorkspaceDefinition[]).map((workspace) => workspace.name)).toEqual(['dev', 'demo']);
      expect(selected).toMatchObject({ currentWorkspaceName: 'demo' });
      expect((removed.workspaces as WorkspaceDefinition[]).map((workspace) => workspace.name)).toEqual(['demo']);
      expect(invalid.status).toBe(400);
    } finally {
      await server.close();
    }
  });

  it('serves the bundled React GUI shell from local assets', async () => {
    const assetRoot = await createTestUiAssets();
    const server = await startTestServer({}, { uiAssetRoot: assetRoot });

    try {
      const unauthorized = await fetch(apiUrl(server, '/'));
      const response = await fetch(`${apiUrl(server, '/')}?token=${encodeURIComponent(token)}`);
      const html = await response.text();
      const asset = await fetch(apiUrl(server, '/assets/index.js'));
      const assetBody = await asset.text();

      expect(unauthorized.status).toBe(401);
      expect(response.status).toBe(200);
      expect(html).toContain('compose UI');
      expect(html).toContain('/assets/index.js');
      expect(html).toContain('window.__COMPOSE_UI_TOKEN__');
      expect(html).toContain('Loading compose UI...');
      expect(html).not.toContain('https://esm.sh');
      expect(asset.status).toBe(200);
      expect(asset.headers.get('content-type')).toContain('text/javascript');
      expect(assetBody).toContain('local bundled app');
    } finally {
      await server.close();
      await rm(assetRoot, { recursive: true, force: true });
    }
  });

  it('serves a visible fallback when bundled UI assets are missing', async () => {
    const missingAssetRoot = join(tmpdir(), `compose-ui-missing-${randomUUID()}`);
    const server = await startTestServer({}, { uiAssetRoot: missingAssetRoot });

    try {
      const response = await fetch(`${apiUrl(server, '/')}?token=${encodeURIComponent(token)}`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain('UI assets are not available');
      expect(html).toContain('npm run build');
      expect(html).toContain('Loading compose UI...');
      expect(html).not.toContain('https://esm.sh');
    } finally {
      await server.close();
    }
  });

  it('reads runtime status for a stack by id', async () => {
    const server = await startTestServer();

    try {
      const status = await getJson(server, `/api/stacks/${encodeURIComponent(project.id)}/runtime`);

      expect(status).toMatchObject({
        projectId: project.id,
        available: true,
        state: 'running',
      });
    } finally {
      await server.close();
    }
  });

  it('lists, previews and commits guided Compose service mutations', async () => {
    const server = await startTestServer();

    try {
      const listed = await getJson(server, `/api/stacks/${encodeURIComponent(project.id)}/services`);
      const preview = await postJson(server, `/api/stacks/${encodeURIComponent(project.id)}/services/preview`, {
        operation: 'create', service: { name: 'worker', image: 'example/worker:latest' },
      });
      const committed = await postJson(server, `/api/stacks/${encodeURIComponent(project.id)}/services/commit`, { preview });

      expect(listed).toMatchObject({ composeFilePath: project.composeFilePath, contentHash: 'hash-before' });
      expect((listed.services as Array<{ name: string }>)[0]?.name).toBe('api');
      expect(preview).toMatchObject({ operation: 'create', serviceName: 'worker' });
      expect(committed).toMatchObject({ operation: 'create', serviceName: 'worker', contentHash: 'hash-after' });
    } finally {
      await server.close();
    }
  });

  it('previews commands and requires confirmation before execution', async () => {
    const server = await startTestServer();

    try {
      const preview = await postJson(server, '/api/commands/preview', {
        command: 'ps',
        composeFilePath: project.composeFilePath,
        services: [],
        options: {},
      });
      const rejectedExecution = await post(server, '/api/commands/execute', {
        command: 'ps',
        composeFilePath: project.composeFilePath,
        services: [],
        options: {},
      });
      const execution = await postJson(server, '/api/commands/execute', {
        command: 'ps',
        composeFilePath: project.composeFilePath,
        services: [],
        options: {},
        confirmed: true,
      });

      expect(preview).toMatchObject({ displayCommand: 'docker compose ps' });
      expect(rejectedExecution.status).toBe(409);
      expect(execution).toMatchObject({ command: 'docker compose ps', exitCode: 0 });
    } finally {
      await server.close();
    }
  });

  it('requires a stronger confirmation for destructive execution', async () => {
    const server = await startTestServer();

    try {
      const rejectedExecution = await post(server, '/api/commands/execute', {
        command: 'down',
        composeFilePath: project.composeFilePath,
        services: [],
        options: {},
        confirmed: true,
      });
      const execution = await postJson(server, '/api/commands/execute', {
        command: 'down',
        composeFilePath: project.composeFilePath,
        services: [],
        options: {},
        confirmed: true,
        destructiveConfirmed: true,
      });

      expect(rejectedExecution.status).toBe(409);
      expect(execution).toMatchObject({ command: 'docker compose down', exitCode: 0 });
    } finally {
      await server.close();
    }
  });
});

async function startTestServer(
  dependencies: LocalUiServerDependencies = {},
  options: Omit<LocalUiServerOptions, 'port' | 'token' | 'open'> = {},
): Promise<LocalUiServer> {
  return startLocalUiServer(
    {
      port: 0,
      token,
      open: false,
      ...options,
    },
    createDependencies(dependencies),
  );
}

async function createTestUiAssets(): Promise<string> {
  const assetRoot = await mkdtemp(join(tmpdir(), 'compose-ui-assets-'));
  const assetDirectory = join(assetRoot, 'assets');

  await mkdir(assetDirectory);
  await writeFile(
    join(assetRoot, 'index.html'),
    [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="utf-8">',
      '  <title>compose UI</title>',
      '</head>',
      '<body>',
      '  <div id="root">Loading compose UI...</div>',
      '  <script type="module" src="/assets/index.js"></script>',
      '</body>',
      '</html>',
    ].join('\n'),
  );
  await writeFile(join(assetDirectory, 'index.js'), 'console.log("local bundled app");\n');

  return assetRoot;
}

async function getJson(server: LocalUiServer, path: string): Promise<Record<string, unknown>> {
  const response = await fetch(apiUrl(server, path), {
    headers: authorizationHeaders(),
  });

  expect(response.status).toBe(200);
  return await response.json() as Record<string, unknown>;
}

async function postJson(server: LocalUiServer, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await post(server, path, body);

  expect(response.status).toBe(200);
  return await response.json() as Record<string, unknown>;
}

async function post(server: LocalUiServer, path: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(apiUrl(server, path), {
    method: 'POST',
    headers: {
      ...authorizationHeaders(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function deleteJson(server: LocalUiServer, path: string): Promise<Record<string, unknown>> {
  const response = await fetch(apiUrl(server, path), {
    method: 'DELETE',
    headers: authorizationHeaders(),
  });

  expect(response.status).toBe(200);
  return await response.json() as Record<string, unknown>;
}

function apiUrl(server: LocalUiServer, path: string): string {
  return `http://${server.host}:${server.port}${path}`;
}

function authorizationHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
  };
}
