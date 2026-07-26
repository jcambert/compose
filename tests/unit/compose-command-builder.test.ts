import { describe, expect, it } from 'vitest';
import { buildComposeCommand } from '../../src/compose/compose-command-builder.js';
import type { ComposeSubCommand } from '../../src/compose/compose-command.js';

const composeFilePath = '/workspace/app/compose.yaml';

describe('buildComposeCommand', () => {
  it('builds an up command with detach, build, scale and remove-orphans', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'up',
      services: ['api'],
      passthroughArgs: [],
      options: {
        detach: true,
        removeOrphans: true,
        build: true,
        scale: ['api=2'],
      },
    });

    expect(command.binary).toBe('docker');
    expect(command.cwd).toBe('/workspace/app');
    expect(command.args).toEqual([
      'compose',
      '-f',
      composeFilePath,
      'up',
      '-d',
      '--remove-orphans',
      '--build',
      '--scale',
      'api=2',
      'api',
    ]);
  });

  it('builds down with volume and orphan cleanup', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'down',
      services: [],
      passthroughArgs: [],
      options: {
        removeOrphans: true,
        volumes: true,
      },
    });

    expect(command.args).toEqual(['compose', '-f', composeFilePath, 'down', '--remove-orphans', '--volumes']);
  });

  it('builds logs with follow and tail', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'logs',
      services: ['api'],
      passthroughArgs: [],
      options: {
        follow: true,
        tail: '200',
      },
    });

    expect(command.args).toEqual(['compose', '-f', composeFilePath, 'logs', '--follow', '--tail', '200', 'api']);
  });

  it('builds build with no-cache and pull', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'build',
      services: ['api'],
      passthroughArgs: [],
      options: {
        noCache: true,
        pull: true,
      },
    });

    expect(command.args).toEqual(['compose', '-f', composeFilePath, 'build', '--no-cache', '--pull', 'api']);
  });

  it('preserves exec passthrough arguments and execution options', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'exec',
      services: ['api'],
      passthroughArgs: ['npm', 'test'],
      options: {
        env: ['NODE_ENV=test'],
        user: 'node',
        workdir: '/app',
      },
    });

    expect(command.args).toEqual([
      'compose',
      '-f',
      composeFilePath,
      'exec',
      '--env',
      'NODE_ENV=test',
      '--user',
      'node',
      '--workdir',
      '/app',
      'api',
      'npm',
      'test',
    ]);
  });

  it('preserves run passthrough arguments and removes the temporary container', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'run',
      services: ['worker'],
      passthroughArgs: ['npm', 'run', 'migrate'],
      options: {
        rm: true,
        env: ['NODE_ENV=production'],
      },
    });

    expect(command.args).toEqual([
      'compose',
      '-f',
      composeFilePath,
      'run',
      '--rm',
      '--env',
      'NODE_ENV=production',
      'worker',
      'npm',
      'run',
      'migrate',
    ]);
  });

  it.each<ComposeSubCommand>(['ps', 'pull', 'restart', 'stop', 'start'])('builds %s with services', (subCommand) => {
    const command = buildComposeCommand({
      composeFilePath,
      command: subCommand,
      services: ['api', 'db'],
      passthroughArgs: [],
      options: {},
    });

    expect(command.args).toEqual(['compose', '-f', composeFilePath, subCommand, 'api', 'db']);
  });

  it('builds config without services or options', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'config',
      services: [],
      passthroughArgs: [],
      options: {},
    });

    expect(command.args).toEqual(['compose', '-f', composeFilePath, 'config']);
  });

  it('adds global compose options before the subcommand', () => {
    const command = buildComposeCommand({
      composeFilePath: '/workspace/app with space/compose.yaml',
      workingDirectory: '/workspace/custom',
      command: 'ps',
      services: [],
      passthroughArgs: [],
      options: {
        projectName: 'demo',
        profile: ['dev', 'debug'],
        noAnsi: true,
      },
    });

    expect(command.cwd).toBe('/workspace/custom');
    expect(command.args).toEqual([
      'compose',
      '-f',
      '/workspace/app with space/compose.yaml',
      '--project-name',
      'demo',
      '--profile',
      'dev',
      '--profile',
      'debug',
      '--ansi=never',
      'ps',
    ]);
    expect(command.displayCommand).toContain('"/workspace/app with space/compose.yaml"');
  });
});
