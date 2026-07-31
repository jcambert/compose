import { describe, expect, it } from 'vitest';
import {
  canDeleteStack,
  createStackCommandRequest,
  executionFailureMessage,
  formatExecutionOutput,
  isStackActive,
} from '../../src/ui/compose-workspace-model.js';

describe('Compose workspace UI model', () => {
  it('creates confirmed typed command requests', () => {
    expect(createStackCommandRequest('/workspace/compose.yaml', 'up', ['api'], {
      detach: true,
    })).toEqual({
      composeFilePath: '/workspace/compose.yaml',
      command: 'up',
      services: ['api'],
      options: { detach: true },
      confirmed: true,
      destructiveConfirmed: false,
    });
    expect(createStackCommandRequest('/workspace/compose.yaml', 'down').destructiveConfirmed).toBe(true);
    expect(createStackCommandRequest('/workspace/compose.yaml', 'rm').destructiveConfirmed).toBe(true);
  });

  it('detects active stacks from aggregate and service states', () => {
    expect(isStackActive(undefined)).toBe(false);
    expect(isStackActive({ available: false, state: 'unavailable', summary: '' })).toBe(false);
    expect(isStackActive({ available: true, state: 'running', summary: '' })).toBe(true);
    expect(isStackActive({
      available: true,
      state: 'stopped',
      summary: '',
      services: {
        api: { state: 'healthy', containerCount: 1 },
      },
    })).toBe(true);
    expect(isStackActive({
      available: true,
      state: 'stopped',
      summary: '',
      services: {
        api: { state: 'exited', containerCount: 1 },
      },
    })).toBe(false);
  });

  it('formats command output and structured diagnostics', () => {
    const output = formatExecutionOutput({
      command: 'docker compose pull',
      exitCode: 1,
      stdout: '',
      stderr: 'denied',
      diagnostic: {
        kind: 'compose-command-failed',
        title: 'Compose failed',
        message: 'The command failed.',
        command: 'docker compose pull',
        workingDirectory: '/workspace',
        composeFilePath: '/workspace/compose.yaml',
        exitCode: 1,
        hints: ['Check registry credentials.'],
        stdout: '',
        stderr: 'denied',
      },
    });

    expect(output).toContain('$ docker compose pull');
    expect(output).toContain('denied');
    expect(output).toContain('Compose failed');
    expect(output).toContain('- Check registry credentials.');
    expect(output).toContain('[exit 1]');
  });

  it('reports failed command results without hiding their output', () => {
    expect(executionFailureMessage({
      command: 'docker compose up',
      exitCode: 0,
      stdout: 'started',
      stderr: '',
    })).toBeUndefined();
    expect(executionFailureMessage({
      command: 'docker compose up',
      exitCode: 1,
      stdout: '',
      stderr: 'fallback stderr',
      diagnostic: {
        kind: 'compose-command-failed',
        title: 'Compose failed',
        message: 'Structured failure',
        command: 'docker compose up',
        workingDirectory: '/workspace',
        composeFilePath: '/workspace/compose.yaml',
        exitCode: 1,
        hints: [],
        stdout: '',
        stderr: 'fallback stderr',
      },
    })).toBe('Structured failure');
  });

  it('requires exact typed-name deletion confirmation', () => {
    expect(canDeleteStack('demo', 'demo')).toBe(true);
    expect(canDeleteStack('demo', 'Demo')).toBe(false);
    expect(canDeleteStack('', '')).toBe(false);
  });
});
