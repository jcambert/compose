import { describe, expect, it } from 'vitest';
import { startLocalUiServer } from '../../src/app/ui-server-service.js';
import type { LocalUiServer, LocalUiServerDependencies } from '../../src/app/ui-server-service.js';
import type { StackRuntimeStatus } from '../../src/interactive/stack-runtime-status.js';
import type { DiscoveredComposeProject } from '../../src/scanner/discovered-project.js';

const token = 'stream-token';
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
  services: {},
  runningServices: 1,
  stoppedServices: 0,
  unhealthyServices: 0,
  unknownServices: 0,
  summary: '1 running · 0 stopped',
};

describe('local UI server streaming endpoints', () => {
  it('streams runtime status over server-sent events', async () => {
    let reads = 0;
    const server = await startTestServer({
      readRuntimeStatus: async () => ({
        ...runtimeStatus,
        summary: `tick ${++reads}`,
      }),
    });

    try {
      const response = await fetch(apiUrl(server, `/api/events/runtime?stackId=${encodeURIComponent(project.id)}&intervalMs=1000`), {
        headers: authorizationHeaders(),
      });
      const content = await readSseUntil(response, 'runtime');

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      expect(content).toContain('event: connected');
      expect(content).toContain('event: runtime');
      expect(content).toContain('"summary":"tick 1"');
    } finally {
      await server.close();
    }
  });

  it('streams docker compose logs over server-sent events', async () => {
    const server = await startTestServer({
      streamLogs: async function* () {
        yield { stream: 'stdout', content: 'api log line\n' };
        yield { stream: 'stderr', content: 'api warning\n' };
        yield { stream: 'exit', exitCode: 0, signal: null };
      },
    });

    try {
      const response = await fetch(apiUrl(server, `/api/logs/stream?stackId=${encodeURIComponent(project.id)}&service=api&tail=25`), {
        headers: authorizationHeaders(),
      });
      const content = await readSseUntil(response, 'logs-complete');

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      expect(content).toContain('event: connected');
      expect(content).toContain('event: log');
      expect(content).toContain('api log line');
      expect(content).toContain('api warning');
      expect(content).toContain('event: logs-complete');
    } finally {
      await server.close();
    }
  });
});

async function startTestServer(overrides: LocalUiServerDependencies = {}): Promise<LocalUiServer> {
  return startLocalUiServer(
    {
      port: 0,
      token,
      open: false,
    },
    {
      runDoctor: async () => ({ ok: true, strict: false, checks: [], exitCode: 0 }),
      listWorkspaces: async () => ({
        currentWorkspaceName: 'dev',
        workspaces: [{ name: 'dev', path: '/workspace' }],
      }),
      addWorkspace: async () => undefined,
      setWorkspace: async () => undefined,
      removeWorkspace: async () => undefined,
      scanProjects: async () => [project],
      readRuntimeStatus: async () => runtimeStatus,
      previewCommand: async () => ({ binary: 'docker', args: ['compose', 'ps'], cwd: '/workspace', displayCommand: 'docker compose ps' }),
      executeCommand: async () => ({
        command: 'docker compose ps',
        exitCode: 0,
        stdout: '',
        stderr: '',
        request: {
          composeFilePath: project.composeFilePath,
          workingDirectory: project.directoryPath,
          command: 'ps',
          services: [],
          options: {},
          passthroughArgs: [],
        },
        dryRun: false,
      }),
      ...overrides,
    },
  );
}

async function readSseUntil(response: Response, eventName: string): Promise<string> {
  const reader = response.body?.getReader();

  expect(reader).toBeDefined();

  const decoder = new TextDecoder();
  let content = '';

  while (!hasCompleteSseEvent(content, eventName)) {
    const { done, value } = await reader!.read();

    if (done) {
      break;
    }

    content += decoder.decode(value, { stream: true });
  }

  await reader!.cancel();

  return content;
}

function hasCompleteSseEvent(content: string, eventName: string): boolean {
  const events = content
    .replaceAll('\r\n', '\n')
    .split('\n\n');

  events.pop();

  return events.some((event) => event.split('\n').includes(`event: ${eventName}`));
}

function apiUrl(server: LocalUiServer, path: string): string {
  return `http://${server.host}:${server.port}${path}`;
}

function authorizationHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
  };
}
