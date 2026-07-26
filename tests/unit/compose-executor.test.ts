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
    expect(result).toEqual({
      command: `docker compose -f ${composeFilePath} logs --follow api`,
      exitCode: 3,
      stdout: 'out',
      stderr: 'err',
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
