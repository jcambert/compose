import { describe, expect, it } from 'vitest';
import type { DiscoveredComposeProject } from '../../src/scanner/discovered-project.js';
import {
  buildComposePsJsonCommand,
  createExecaRuntimeStatusRunner,
  parseComposePsJsonOutput,
  readStackRuntimeStatus,
} from '../../src/interactive/stack-runtime-status.js';

function createProject(overrides: Partial<DiscoveredComposeProject> = {}): DiscoveredComposeProject {
  return {
    id: 'stack-1',
    name: 'infra',
    composeFilePath: '/workspace/infra/compose.yaml',
    directoryPath: '/workspace/infra',
    relativePath: 'infra/compose.yaml',
    services: ['api', 'db', 'worker'],
    warnings: [],
    ...overrides,
  };
}

describe('stack runtime status', () => {
  it('builds a docker compose ps json command with common options', () => {
    const command = buildComposePsJsonCommand(createProject(), {
      noAnsi: true,
      projectName: 'demo',
      profile: ['dev', 'ops'],
    });

    expect(command).toEqual({
      binary: 'docker',
      args: [
        'compose',
        '-f',
        '/workspace/infra/compose.yaml',
        '--project-name',
        'demo',
        '--profile',
        'dev',
        '--profile',
        'ops',
        '--ansi=never',
        'ps',
        '--format',
        'json',
      ],
      cwd: '/workspace/infra',
      displayCommand:
        'docker compose -f /workspace/infra/compose.yaml --project-name demo --profile dev --profile ops --ansi=never ps --format json',
    });
  });

  it('parses json array output from docker compose ps', () => {
    const services = parseComposePsJsonOutput(
      JSON.stringify([
        {
          Service: 'api',
          Name: 'infra-api-1',
          State: 'running',
          Health: 'healthy',
          Publishers: [{ URL: '0.0.0.0', PublishedPort: 5000, TargetPort: 80, Protocol: 'tcp' }],
        },
        {
          Service: 'worker',
          Name: 'infra-worker-1',
          State: 'exited',
        },
      ]),
      ['api', 'db', 'worker'],
    );

    expect(services).toEqual([
      {
        serviceName: 'api',
        state: 'running',
        health: 'healthy',
        containerCount: 1,
        ports: ['0.0.0.0:5000->80/tcp'],
        containerNames: ['infra-api-1'],
      },
      {
        serviceName: 'db',
        state: 'stopped',
        containerCount: 0,
        ports: [],
        containerNames: [],
      },
      {
        serviceName: 'worker',
        state: 'exited',
        containerCount: 1,
        ports: [],
        containerNames: ['infra-worker-1'],
      },
    ]);
  });

  it('parses newline-delimited json output and detects unhealthy services', () => {
    const services = parseComposePsJsonOutput(
      [
        JSON.stringify({ Service: 'api', Name: 'api-1', State: 'running' }),
        JSON.stringify({ Service: 'api', Name: 'api-2', State: 'running', Status: 'Up 10 seconds (unhealthy)' }),
      ].join('\n'),
      ['api'],
    );

    expect(services).toEqual([
      {
        serviceName: 'api',
        state: 'unhealthy',
        health: 'unhealthy',
        containerCount: 2,
        ports: [],
        containerNames: ['api-1', 'api-2'],
      },
    ]);
  });

  it('returns stack status from injected command runner', async () => {
    const project = createProject();
    const status = await readStackRuntimeStatus(
      project,
      {},
      async () => ({
        exitCode: 0,
        stdout: JSON.stringify([{ Service: 'api', Name: 'api-1', State: 'running' }]),
        stderr: '',
      }),
    );

    expect(status).toMatchObject({
      projectId: 'stack-1',
      available: true,
      state: 'partial',
      runningServices: 1,
      stoppedServices: 2,
      unhealthyServices: 0,
      unknownServices: 0,
      summary: '1 running · 2 stopped',
    });
  });

  it('falls back when docker compose status cannot be read', async () => {
    const status = await readStackRuntimeStatus(
      createProject(),
      {},
      async () => ({ exitCode: 1, stdout: '', stderr: 'docker not available' }),
    );

    expect(status).toMatchObject({
      available: false,
      state: 'unavailable',
      summary: 'runtime status unavailable',
      warning: 'docker not available',
    });
  });

  it('does not call docker while dry-run mode is enabled', async () => {
    let called = false;

    const status = await readStackRuntimeStatus(
      createProject(),
      { dryRun: true },
      async () => {
        called = true;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );

    expect(called).toBe(false);
    expect(status.warning).toBe('Runtime status is disabled in dry-run mode.');
  });

  it('normalizes execa results for runtime status reads', async () => {
    const runner = createExecaRuntimeStatusRunner(async () => ({
      exitCode: null,
      stdout: '[]',
      stderr: undefined,
    }));

    await expect(runner('docker', ['compose', 'ps'], { cwd: '/workspace' })).resolves.toEqual({
      exitCode: 0,
      stdout: '[]',
      stderr: '',
    });
  });
});