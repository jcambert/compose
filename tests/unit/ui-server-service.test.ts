import { describe, expect, it } from 'vitest';
import type { ComposeApplicationCommandInput, ComposeApplicationCommandResult } from '../../src/app/compose-command-service.js';
import { startLocalUiServer } from '../../src/app/ui-server-service.js';
import type { LocalUiServer, LocalUiServerDependencies } from '../../src/app/ui-server-service.js';
import type { BuiltComposeCommand } from '../../src/compose/compose-command.js';
import type { StackRuntimeStatus } from '../../src/interactive/stack-runtime-status.js';
import type { DiscoveredComposeProject } from '../../src/scanner/discovered-project.js';

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
    scanProjects: async () => [project],
    readRuntimeStatus: async () => runtimeStatus,
    previewCommand: async (input: ComposeApplicationCommandInput): Promise<BuiltComposeCommand> => ({
      binary: 'docker',
      args: ['compose', input.command],
      cwd: '/workspace/infra',
      displayCommand: `docker compose ${input.command}`,
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

async function startTestServer(dependencies: LocalUiServerDependencies = {}): Promise<LocalUiServer> {
  return startLocalUiServer(
    {
      port: 0,
      token,
      open: false,
    },
    createDependencies(dependencies),
  );
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

function apiUrl(server: LocalUiServer, path: string): string {
  return `http://${server.host}:${server.port}${path}`;
}

function authorizationHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
  };
}
