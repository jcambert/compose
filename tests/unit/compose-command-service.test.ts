import { describe, expect, it } from 'vitest';
import {
  executeComposeApplicationCommand,
  previewComposeApplicationCommand,
  resolveComposeApplicationCommand,
} from '../../src/app/compose-command-service.js';
import type { ProcessRunner } from '../../src/compose/compose-executor.js';

const composeFilePath = '/workspace/app/compose.yaml';

describe('compose application command service', () => {
  it('resolves and returns the generated command in dry-run mode', async () => {
    const result = await executeComposeApplicationCommand({
      composeFilePath,
      command: 'ps',
      services: [],
      passthroughArgs: [],
      options: { dryRun: true },
    });

    expect(result.dryRun).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.command).toBe(`docker compose -f ${composeFilePath} ps`);
    expect(result.request.workingDirectory).toBe('/workspace/app');
  });

  it('executes the resolved command through an injected process runner', async () => {
    const calls: Array<{ binary: string; args: string[]; options: { cwd: string } }> = [];
    const runner: ProcessRunner = async (binary, args, options) => {
      calls.push({ binary, args, options });
      return { exitCode: 4, stdout: 'out', stderr: 'err' };
    };

    const result = await executeComposeApplicationCommand(
      {
        composeFilePath,
        command: 'logs',
        services: ['api'],
        passthroughArgs: [],
        options: { follow: true },
      },
      { processRunner: runner },
    );

    expect(calls).toEqual([
      {
        binary: 'docker',
        args: ['compose', '-f', composeFilePath, 'logs', '--follow', 'api'],
        options: { cwd: '/workspace/app' },
      },
    ]);
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe('out');
    expect(result.stderr).toBe('err');
  });

  it('applies guided safe defaults without a terminal prompt adapter when --yes is used', async () => {
    const request = await resolveComposeApplicationCommand(
      {
        composeFilePath,
        command: 'up',
        services: [],
        passthroughArgs: [],
        options: { guided: true, yes: true },
      },
      {
        parseComposeDocument: async () => ({ services: { api: { image: 'node:22-alpine' } } }),
      },
    );

    expect(request.options.detach).toBe(true);
    expect(request.options.build).toBe(false);
    expect(request.options.removeOrphans).toBe(false);
    expect(request.services).toEqual([]);
  });

  it('previews the resolved command without executing it', async () => {
    const command = await previewComposeApplicationCommand({
      composeFilePath,
      command: 'restart',
      services: ['api'],
      passthroughArgs: [],
      options: { timeout: '15' },
    });

    expect(command.displayCommand).toBe(`docker compose -f ${composeFilePath} restart --timeout 15 api`);
  });
});
