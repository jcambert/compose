import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatDoctorReport, runDoctor } from '../../src/doctor/doctor.js';
import type { DoctorCheckStatus, DoctorCommandRunner } from '../../src/doctor/doctor.js';
import { addWorkspace, createWorkspaceStore } from '../../src/workspace/workspace-store.js';

async function createTemporaryWorkspaceStore() {
  const root = await mkdtemp(join(tmpdir(), 'compose-doctor-'));
  return createWorkspaceStore(join(root, 'config.json'));
}

function createSuccessfulRunner(): DoctorCommandRunner {
  return async (binary, args) => {
    if (binary === 'which' || binary === 'where.exe') {
      return { exitCode: 0, stdout: '/usr/local/bin/compose', stderr: '' };
    }

    if (binary === 'npm' && args.join(' ') === 'prefix -g') {
      return { exitCode: 0, stdout: '/usr/local', stderr: '' };
    }

    if (binary === 'docker' && args.join(' ') === '--version') {
      return { exitCode: 0, stdout: 'Docker version 27.0.0', stderr: '' };
    }

    if (binary === 'docker' && args.join(' ') === 'compose version') {
      return { exitCode: 0, stdout: 'Docker Compose version v2.30.0', stderr: '' };
    }

    return { exitCode: 1, stdout: '', stderr: `Unexpected command: ${binary} ${args.join(' ')}` };
  };
}

function createFailingDockerRunner(): DoctorCommandRunner {
  const successfulRunner = createSuccessfulRunner();

  return async (binary, args) => {
    if (binary === 'docker') {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'docker: command not found',
      };
    }

    return successfulRunner(binary, args);
  };
}

function createFailingNpmRunner(): DoctorCommandRunner {
  const successfulRunner = createSuccessfulRunner();

  return async (binary, args) => {
    if (binary === 'npm' && args.join(' ') === 'prefix -g') {
      return { exitCode: 1, stdout: '', stderr: 'npm: command not found' };
    }

    return successfulRunner(binary, args);
  };
}

function createMissingComposeExecutableRunner(): DoctorCommandRunner {
  const successfulRunner = createSuccessfulRunner();

  return async (binary, args) => {
    if (binary === 'which' || binary === 'where.exe') {
      return { exitCode: 1, stdout: '', stderr: 'compose not found' };
    }

    return successfulRunner(binary, args);
  };
}

function createPathEnvironment(pathValue = '/usr/local/bin:/bin') {
  return { PATH: pathValue };
}

function getCheckStatuses(report: Awaited<ReturnType<typeof runDoctor>>): Record<string, DoctorCheckStatus> {
  return Object.fromEntries(report.checks.map((check) => [check.id, check.status]));
}

describe('doctor diagnostics', () => {
  it('returns an ok report when CLI, Node, npm, PATH, Docker, config and workspace are ready', async () => {
    const store = await createTemporaryWorkspaceStore();
    await store.save(addWorkspace(await store.load(), 'dev', '/workspace'));

    const report = await runDoctor({
      cliVersion: '0.1.2',
      nodeVersion: '20.19.0',
      workspaceStore: store,
      commandRunner: createSuccessfulRunner(),
      environment: createPathEnvironment(),
    });

    expect(report.ok).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(getCheckStatuses(report)).toEqual({
      'compose-cli-version': 'ok',
      'node-version': 'ok',
      'compose-executable': 'ok',
      'npm-global-prefix': 'ok',
      'path-npm-prefix': 'ok',
      'docker-cli': 'ok',
      'docker-compose': 'ok',
      'user-config': 'ok',
      'current-workspace': 'ok',
    });
  });

  it('reports unsupported Node.js versions as errors', async () => {
    const store = await createTemporaryWorkspaceStore();

    const report = await runDoctor({
      cliVersion: '0.1.2',
      nodeVersion: '20.18.0',
      workspaceStore: store,
      commandRunner: createSuccessfulRunner(),
      environment: createPathEnvironment(),
      skipDocker: true,
    });

    expect(report.ok).toBe(false);
    expect(report.exitCode).toBe(1);
    expect(getCheckStatuses(report)['node-version']).toBe('error');
  });

  it('can skip Docker checks for CI smoke tests', async () => {
    const store = await createTemporaryWorkspaceStore();

    const report = await runDoctor({
      cliVersion: '0.1.2',
      nodeVersion: '22.0.0',
      workspaceStore: store,
      commandRunner: createFailingDockerRunner(),
      environment: createPathEnvironment(),
      skipDocker: true,
    });

    expect(report.ok).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(getCheckStatuses(report)['docker-skipped']).toBe('warning');
  });

  it('fails when Docker is unavailable and checks are not skipped', async () => {
    const store = await createTemporaryWorkspaceStore();

    const report = await runDoctor({
      cliVersion: '0.1.2',
      nodeVersion: '22.0.0',
      workspaceStore: store,
      commandRunner: createFailingDockerRunner(),
      environment: createPathEnvironment(),
    });

    expect(report.ok).toBe(false);
    expect(report.exitCode).toBe(1);
    expect(report.checks.filter((check) => check.status === 'error').map((check) => check.name)).toEqual(['Docker', 'Docker Compose']);
  });

  it('reports command-not-found installation issues as warnings', async () => {
    const store = await createTemporaryWorkspaceStore();

    const report = await runDoctor({
      cliVersion: '0.1.2',
      nodeVersion: '22.0.0',
      workspaceStore: store,
      commandRunner: createMissingComposeExecutableRunner(),
      environment: createPathEnvironment(),
      skipDocker: true,
    });

    const executableCheck = report.checks.find((check) => check.id === 'compose-executable');

    expect(executableCheck?.status).toBe('warning');
    expect(executableCheck?.message).toContain('not discoverable from PATH');
    expect(report.ok).toBe(true);
  });

  it('warns when npm global executable directory is missing from PATH', async () => {
    const store = await createTemporaryWorkspaceStore();

    const report = await runDoctor({
      cliVersion: '0.1.2',
      nodeVersion: '22.0.0',
      workspaceStore: store,
      commandRunner: createSuccessfulRunner(),
      environment: createPathEnvironment('/bin'),
      skipDocker: true,
    });

    const pathCheck = report.checks.find((check) => check.id === 'path-npm-prefix');

    expect(pathCheck?.status).toBe('warning');
    expect(pathCheck?.details).toContain('/usr/local/bin');
    expect(report.ok).toBe(true);
  });

  it('warns when npm global prefix cannot be resolved', async () => {
    const store = await createTemporaryWorkspaceStore();

    const report = await runDoctor({
      cliVersion: '0.1.2',
      nodeVersion: '22.0.0',
      workspaceStore: store,
      commandRunner: createFailingNpmRunner(),
      environment: createPathEnvironment(),
      skipDocker: true,
    });

    const prefixCheck = report.checks.find((check) => check.id === 'npm-global-prefix');

    expect(prefixCheck?.status).toBe('warning');
    expect(report.checks.some((check) => check.id === 'path-npm-prefix')).toBe(false);
    expect(report.ok).toBe(true);
  });

  it('treats warnings as failures in strict mode', async () => {
    const store = await createTemporaryWorkspaceStore();

    const report = await runDoctor({
      cliVersion: '0.1.2',
      nodeVersion: '22.0.0',
      workspaceStore: store,
      commandRunner: createSuccessfulRunner(),
      environment: createPathEnvironment(),
      strict: true,
    });

    expect(report.ok).toBe(false);
    expect(report.exitCode).toBe(1);
    expect(getCheckStatuses(report)['current-workspace']).toBe('warning');
  });

  it('formats a human-readable report', async () => {
    const store = await createTemporaryWorkspaceStore();
    const report = await runDoctor({
      cliVersion: '0.1.2',
      nodeVersion: '22.0.0',
      workspaceStore: store,
      commandRunner: createSuccessfulRunner(),
      environment: createPathEnvironment(),
      skipDocker: true,
    });

    const formattedReport = formatDoctorReport(report);

    expect(formattedReport).toContain('Compose doctor: OK');
    expect(formattedReport).toContain('compose CLI');
    expect(formattedReport).toContain('npm global prefix');
    expect(formattedReport).toContain('User config');
  });
});
