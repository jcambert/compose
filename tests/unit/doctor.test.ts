import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatDoctorReport, runDoctor } from '../../src/doctor/doctor.js';
import type { DoctorCommandRunner } from '../../src/doctor/doctor.js';
import { addWorkspace, createWorkspaceStore } from '../../src/workspace/workspace-store.js';

async function createTemporaryWorkspaceStore() {
  const root = await mkdtemp(join(tmpdir(), 'compose-doctor-'));
  return createWorkspaceStore(join(root, 'config.json'));
}

function createSuccessfulRunner(): DoctorCommandRunner {
  return async (_binary, args) => ({
    exitCode: 0,
    stdout: args.includes('compose') ? 'Docker Compose version v2.30.0' : 'Docker version 27.0.0',
    stderr: '',
  });
}

function createFailingRunner(): DoctorCommandRunner {
  return async () => ({
    exitCode: 1,
    stdout: '',
    stderr: 'docker: command not found',
  });
}

describe('doctor diagnostics', () => {
  it('returns an ok report when Node, Docker, config and workspace are ready', async () => {
    const store = await createTemporaryWorkspaceStore();
    await store.save(addWorkspace(await store.load(), 'dev', '/workspace'));

    const report = await runDoctor({
      nodeVersion: '20.19.0',
      workspaceStore: store,
      commandRunner: createSuccessfulRunner(),
    });

    expect(report.ok).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(report.checks.map((check) => check.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
  });

  it('reports unsupported Node.js versions as errors', async () => {
    const store = await createTemporaryWorkspaceStore();

    const report = await runDoctor({
      nodeVersion: '20.18.0',
      workspaceStore: store,
      commandRunner: createSuccessfulRunner(),
      skipDocker: true,
    });

    expect(report.ok).toBe(false);
    expect(report.exitCode).toBe(1);
    expect(report.checks.find((check) => check.name === 'Node.js')?.status).toBe('error');
  });

  it('can skip Docker checks for CI smoke tests', async () => {
    const store = await createTemporaryWorkspaceStore();

    const report = await runDoctor({
      nodeVersion: '22.0.0',
      workspaceStore: store,
      commandRunner: createFailingRunner(),
      skipDocker: true,
    });

    expect(report.ok).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(report.checks.find((check) => check.name === 'Docker')?.status).toBe('warning');
  });

  it('fails when Docker is unavailable and checks are not skipped', async () => {
    const store = await createTemporaryWorkspaceStore();

    const report = await runDoctor({
      nodeVersion: '22.0.0',
      workspaceStore: store,
      commandRunner: createFailingRunner(),
    });

    expect(report.ok).toBe(false);
    expect(report.exitCode).toBe(1);
    expect(report.checks.filter((check) => check.status === 'error').map((check) => check.name)).toEqual(['Docker', 'Docker Compose']);
  });

  it('treats warnings as failures in strict mode', async () => {
    const store = await createTemporaryWorkspaceStore();

    const report = await runDoctor({
      nodeVersion: '22.0.0',
      workspaceStore: store,
      commandRunner: createSuccessfulRunner(),
      strict: true,
    });

    expect(report.ok).toBe(false);
    expect(report.exitCode).toBe(1);
    expect(report.checks.find((check) => check.name === 'Workspace')?.status).toBe('warning');
  });

  it('formats a human-readable report', async () => {
    const store = await createTemporaryWorkspaceStore();
    const report = await runDoctor({
      nodeVersion: '22.0.0',
      workspaceStore: store,
      commandRunner: createSuccessfulRunner(),
      skipDocker: true,
    });

    const formattedReport = formatDoctorReport(report);

    expect(formattedReport).toContain('Compose doctor: OK');
    expect(formattedReport).toContain('Node.js');
    expect(formattedReport).toContain('User config');
  });
});
