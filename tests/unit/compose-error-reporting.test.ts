import { describe, expect, it } from 'vitest';
import type { BuiltComposeCommand, ComposeExecutionRequest } from '../../src/compose/compose-command.js';
import {
  createComposeExecutionDiagnostic,
  formatComposeExecutionDiagnostic,
  type ComposeExecutionDiagnostic,
} from '../../src/compose/compose-error-reporting.js';

const composeFilePath = '/workspace/app/compose.yaml';
const request: ComposeExecutionRequest = {
  composeFilePath,
  command: 'ps',
  services: [],
  passthroughArgs: [],
  options: {},
};
const builtCommand: BuiltComposeCommand = {
  binary: 'docker',
  args: ['compose', '-f', composeFilePath, 'ps'],
  cwd: '/workspace/app',
  displayCommand: `docker compose -f ${composeFilePath} ps`,
};

describe('compose execution diagnostics', () => {
  it.each([
    { stderr: 'spawn docker ENOENT', stdout: '', error: undefined },
    { stderr: 'docker: command not found', stdout: '', error: undefined },
    { stderr: 'docker: not found', stdout: '', error: undefined },
    { stderr: 'docker is not recognized as an internal or external command', stdout: '', error: undefined },
    { stderr: '', stdout: '', error: Object.assign(new Error('missing binary'), { code: 'ENOENT' }) },
  ])('classifies unavailable docker diagnostics %#', (input) => {
    const diagnostic = createComposeExecutionDiagnostic({
      request,
      builtCommand,
      exitCode: 127,
      stdout: input.stdout,
      stderr: input.stderr,
      ...(input.error === undefined ? {} : { error: input.error }),
    });

    expect(diagnostic.kind).toBe('docker-unavailable');
    expect(diagnostic.title).toBe('Docker is not available.');
  });

  it.each([
    `stat ${composeFilePath}: no such file or directory`,
    'compose: no configuration file provided: not found',
    'compose: can\'t find a suitable configuration file in this directory or any parent',
    `cannot find the file specified: ${composeFilePath}`,
    `the system cannot find the file specified: ${composeFilePath}`,
  ])('classifies missing compose file diagnostics %#', (stderr) => {
    const diagnostic = createComposeExecutionDiagnostic({
      request,
      builtCommand,
      exitCode: 14,
      stdout: '',
      stderr,
    });

    expect(diagnostic.kind).toBe('compose-file-missing');
    expect(diagnostic.message).toContain(composeFilePath);
  });

  it('keeps generic failures when file-system text is unrelated to the compose file', () => {
    const diagnostic = createComposeExecutionDiagnostic({
      request,
      builtCommand,
      exitCode: 1,
      stdout: '',
      stderr: 'plugin failed: no such file or directory',
    });

    expect(diagnostic.kind).toBe('compose-command-failed');
  });

  it('formats diagnostics with hints and raw output', () => {
    const diagnostic = createComposeExecutionDiagnostic({
      request,
      builtCommand,
      exitCode: 2,
      stdout: 'out',
      stderr: 'err',
    });

    const formatted = formatComposeExecutionDiagnostic(diagnostic);

    expect(formatted).toContain('Docker Compose command failed.');
    expect(formatted).toContain(`command: ${builtCommand.displayCommand}`);
    expect(formatted).toContain('hints:');
    expect(formatted).toContain('stdout:\nout');
    expect(formatted).toContain('stderr:\nerr');
  });

  it('omits optional sections when a diagnostic has no hints or output', () => {
    const diagnostic: ComposeExecutionDiagnostic = {
      kind: 'compose-command-failed',
      title: 'title',
      message: 'message',
      command: 'docker compose ps',
      workingDirectory: '/workspace/app',
      composeFilePath,
      exitCode: 1,
      hints: [],
      stdout: '',
      stderr: '',
    };

    const formatted = formatComposeExecutionDiagnostic(diagnostic);

    expect(formatted).not.toContain('hints:');
    expect(formatted).not.toContain('stdout:');
    expect(formatted).not.toContain('stderr:');
  });
});
