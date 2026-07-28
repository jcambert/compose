import { describe, expect, it } from 'vitest';
import {
  createExecaProcessRunner,
  executeComposeCommand,
  type ExecaLike,
  type ExecaProcessOptions,
} from '../../src/compose/compose-executor.js';

const composeFilePath = '/workspace/app/compose.yaml';

describe('executeComposeCommand', () => {
  it('returns the generated command without running a process in dry-run mode', async () => {
    let wasCalled = false;

    const result = await executeComposeCommand(
      {
        composeFilePath,
        command: 'ps',
        services: [],
        passthroughArgs: [],
        options: {
          dryRun: true,
        },
      },
      async () => {
        wasCalled = true;
        return { exitCode: 1, stdout: '', stderr: '' };
      },
    );

    expect(wasCalled).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`docker compose -f ${composeFilePath} ps`);
    expect(result.stderr).toBe('');
    expect(result.diagnostic).toBeUndefined();
  });

  it('runs the generated docker compose command through the provided process runner', async () => {
    const calls: Array<{ binary: string; args: string[]; options: { cwd: string } }> = [];

    const result = await executeComposeCommand(
      {
        composeFilePath,
        command: 'logs',
        services: ['api'],
        passthroughArgs: [],
        options: {
          follow: true,
        },
      },
      async (binary, args, options) => {
        calls.push({ binary, args, options });
        return { exitCode: 3, stdout: 'out', stderr: 'err' };
      },
    );

    expect(calls).toEqual([
      {
        binary: 'docker',
        args: ['compose', '-f', composeFilePath, 'logs', '--follow', 'api'],
        options: { cwd: '/workspace/app' },
      },
    ]);
    expect(result).toMatchObject({
      command: `docker compose -f ${composeFilePath} logs --follow api`,
      exitCode: 3,
      stdout: 'out',
      stderr: 'err',
      diagnostic: {
        kind: 'compose-command-failed',
        command: `docker compose -f ${composeFilePath} logs --follow api`,
        workingDirectory: '/workspace/app',
        composeFilePath,
        exitCode: 3,
      },
    });
  });

  it('returns a docker-unavailable diagnostic when the process runner cannot start docker', async () => {
    const result = await executeComposeCommand(
      {
        composeFilePath,
        command: 'ps',
        services: [],
        passthroughArgs: [],
        options: {},
      },
      async () => {
        const error = new Error('spawn docker ENOENT') as Error & { code: string };
        error.code = 'ENOENT';
        throw error;
      },
    );

    expect(result.exitCode).toBe(127);
    expect(result.diagnostic).toMatchObject({
      kind: 'docker-unavailable',
      title: 'Docker is not available.',
      workingDirectory: '/workspace/app',
      composeFilePath,
    });
    expect(result.diagnostic?.hints).toContain('Run compose doctor for local installation diagnostics.');
  });

  it('returns a compose-file-missing diagnostic when docker cannot read the compose file', async () => {
    const result = await executeComposeCommand(
      {
        composeFilePath,
        command: 'ps',
        services: [],
        passthroughArgs: [],
        options: {},
      },
      async () => ({
        exitCode: 14,
        stdout: '',
        stderr: `stat ${composeFilePath}: no such file or directory`,
      }),
    );

    expect(result.diagnostic).toMatchObject({
      kind: 'compose-file-missing',
      title: 'Compose file was not found.',
      composeFilePath,
      exitCode: 14,
    });
  });
});

describe('createExecaProcessRunner', () => {
  it('maps execa options and string output', async () => {
    const calls: Array<{ binary: string; args: string[]; options: ExecaProcessOptions }> = [];
    const fakeExeca: ExecaLike = async (binary, args, options) => {
      calls.push({ binary, args, options });
      return { exitCode: 7, stdout: 'stdout', stderr: 'stderr' };
    };

    const runner = createExecaProcessRunner(fakeExeca);
    const result = await runner('docker', ['compose', 'ps'], { cwd: '/workspace/app' });

    expect(calls).toEqual([
      {
        binary: 'docker',
        args: ['compose', 'ps'],
        options: {
          cwd: '/workspace/app',
          reject: false,
          stdout: 'inherit',
          stderr: 'inherit',
        },
      },
    ]);
    expect(result).toEqual({ exitCode: 7, stdout: 'stdout', stderr: 'stderr' });
  });

  it('normalises missing exit code and non-string output', async () => {
    const fakeExeca: ExecaLike = async () => ({ stdout: 42, stderr: null });

    const runner = createExecaProcessRunner(fakeExeca);
    const result = await runner('docker', ['compose', 'ps'], { cwd: '/workspace/app' });

    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });
});
