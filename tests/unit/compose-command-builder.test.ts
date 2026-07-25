import { describe, expect, it } from 'vitest';
import { buildComposeCommand } from '../../src/compose/compose-command-builder.js';

const composeFilePath = '/workspace/app/compose.yaml';

describe('buildComposeCommand', () => {
  it('builds an up command with detach and remove-orphans', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'up',
      services: ['api'],
      passthroughArgs: [],
      options: {
        detach: true,
        removeOrphans: true,
      },
    });

    expect(command.binary).toBe('docker');
    expect(command.args).toEqual(['compose', '-f', composeFilePath, 'up', '-d', '--remove-orphans', 'api']);
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

  it('preserves exec passthrough arguments', () => {
    const command = buildComposeCommand({
      composeFilePath,
      command: 'exec',
      services: ['api'],
      passthroughArgs: ['npm', 'test'],
      options: {
        env: ['NODE_ENV=test'],
      },
    });

    expect(command.args).toEqual([
      'compose',
      '-f',
      composeFilePath,
      'exec',
      '--env',
      'NODE_ENV=test',
      'api',
      'npm',
      'test',
    ]);
  });
});
