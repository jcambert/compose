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

  it.each<ComposeSubCommand>(['ps', 'pull', 'restart', 'stop', 'start', 'create', 'pause', 'unpause', 'images', 'top', 'watch'])('builds %s with services', (subCommand) => {
    const command = buildComposeCommand({
      composeFilePath,
      command: subCommand,
      services: ['api', 'db'],
      passthroughArgs: [],
      options: {},
    });

    expect(command.args).toEqual(['compose', '-f', composeFilePath, subCommand, 'api', 'db']);
  });

  it('builds ps with all, quiet and format options', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'ps',
      services: [],
      passthroughArgs: [],
      options: { all: true, quiet: true, format: 'json' },
    });

    expect(command.args).toEqual(['compose', '-f', composeFilePath, 'ps', '--all', '--quiet', '--format', 'json']);
  });

  it('builds create with build, no-build and orphan cleanup', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'create',
      services: ['api'],
      passthroughArgs: [],
      options: { build: true, noBuild: true, removeOrphans: true },
    });

    expect(command.args).toEqual(['compose', '-f', composeFilePath, 'create', '--build', '--no-build', '--remove-orphans', 'api']);
  });

  it('builds kill with a signal', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'kill',
      services: ['api'],
      passthroughArgs: [],
      options: { signal: 'SIGTERM' },
    });

    expect(command.args).toEqual(['compose', '-f', composeFilePath, 'kill', '--signal', 'SIGTERM', 'api']);
  });

  it('builds rm with force, stop and volume cleanup', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'rm',
      services: ['api'],
      passthroughArgs: [],
      options: { force: true, stop: true, volumes: true },
    });

    expect(command.args).toEqual(['compose', '-f', composeFilePath, 'rm', '--force', '--stop', '--volumes', 'api']);
  });

  it('builds config with validation and projection options', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'config',
      services: [],
      passthroughArgs: [],
      options: {
        quiet: true,
        noInterpolate: true,
        servicesOnly: true,
        volumesOnly: true,
        profilesOnly: true,
        format: 'json',
      },
    });

    expect(command.args).toEqual([
      'compose',
      '-f',
      composeFilePath,
      'config',
      '--quiet',
      '--no-interpolate',
      '--services',
      '--volumes',
      '--profiles',
      '--format',
      'json',
    ]);
  });

  it('builds cp with source and target passthrough arguments', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'cp',
      services: [],
      passthroughArgs: ['api:/tmp/file.txt', './file.txt'],
      options: {},
    });

    expect(command.args).toEqual(['compose', '-f', composeFilePath, 'cp', 'api:/tmp/file.txt', './file.txt']);
  });

  it('builds events with json output and service filtering', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'events',
      services: ['api'],
      passthroughArgs: [],
      options: { json: true },
    });

    expect(command.args).toEqual(['compose', '-f', composeFilePath, 'events', '--json', 'api']);
  });

  it('builds ls with all, quiet and format', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'ls',
      services: [],
      passthroughArgs: [],
      options: { all: true, quiet: true, format: 'json' },
    });

    expect(command.args).toEqual(['compose', '-f', composeFilePath, 'ls', '--all', '--quiet', '--format', 'json']);
  });

  it('builds port with service and private port', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'port',
      services: ['api'],
      passthroughArgs: ['80'],
      options: {},
    });

    expect(command.args).toEqual(['compose', '-f', composeFilePath, 'port', 'api', '80']);
  });

  it('builds version with short output', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'version',
      services: [],
      passthroughArgs: [],
      options: { short: true },
    });

    expect(command.args).toEqual(['compose', '-f', composeFilePath, 'version', '--short']);
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
