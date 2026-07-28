import type { BuiltComposeCommand, ComposeExecutionRequest } from './compose-command.js';

export type ComposeFailureKind =
  | 'docker-unavailable'
  | 'compose-file-missing'
  | 'compose-command-failed';

export type ComposeExecutionDiagnostic = {
  kind: ComposeFailureKind;
  title: string;
  message: string;
  command: string;
  workingDirectory: string;
  composeFilePath: string;
  exitCode: number;
  hints: string[];
  stdout: string;
  stderr: string;
};

export type ComposeExecutionDiagnosticInput = {
  request: ComposeExecutionRequest;
  builtCommand: BuiltComposeCommand;
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: unknown;
};

export function createComposeExecutionDiagnostic(input: ComposeExecutionDiagnosticInput): ComposeExecutionDiagnostic {
  const kind = classifyComposeFailure(input);
  const failure = describeFailure(kind, input);

  return {
    kind,
    title: failure.title,
    message: failure.message,
    command: input.builtCommand.displayCommand,
    workingDirectory: input.builtCommand.cwd,
    composeFilePath: input.request.composeFilePath,
    exitCode: input.exitCode,
    hints: failure.hints,
    stdout: input.stdout,
    stderr: input.stderr,
  };
}

export function formatComposeExecutionDiagnostic(diagnostic: ComposeExecutionDiagnostic): string {
  return [
    diagnostic.title,
    '',
    diagnostic.message,
    '',
    `kind: ${diagnostic.kind}`,
    `command: ${diagnostic.command}`,
    `workingDirectory: ${diagnostic.workingDirectory}`,
    `composeFilePath: ${diagnostic.composeFilePath}`,
    `exitCode: ${diagnostic.exitCode}`,
    diagnostic.hints.length === 0 ? undefined : `hints:\n${diagnostic.hints.map((hint) => `- ${hint}`).join('\n')}`,
    diagnostic.stdout.length === 0 ? undefined : `stdout:\n${diagnostic.stdout}`,
    diagnostic.stderr.length === 0 ? undefined : `stderr:\n${diagnostic.stderr}`,
  ].filter((line): line is string => line !== undefined).join('\n');
}

function classifyComposeFailure(input: ComposeExecutionDiagnosticInput): ComposeFailureKind {
  const haystack = [
    input.stderr,
    input.stdout,
    readErrorMessage(input.error),
    readErrorCode(input.error),
  ].join('\n').toLowerCase();

  if (
    haystack.includes('enoent')
    || haystack.includes('spawn docker')
    || haystack.includes('docker: command not found')
    || haystack.includes('docker: not found')
    || haystack.includes('not recognized as an internal or external command')
  ) {
    return 'docker-unavailable';
  }

  if (
    haystack.includes('no such file or directory')
    || haystack.includes('no configuration file provided')
    || haystack.includes('can\'t find a suitable configuration file')
    || haystack.includes('cannot find the file specified')
    || haystack.includes('the system cannot find the file specified')
  ) {
    if (haystack.includes('compose') || haystack.includes(input.request.composeFilePath.toLowerCase())) {
      return 'compose-file-missing';
    }
  }

  return 'compose-command-failed';
}

function describeFailure(
  kind: ComposeFailureKind,
  input: ComposeExecutionDiagnosticInput,
): Pick<ComposeExecutionDiagnostic, 'title' | 'message' | 'hints'> {
  switch (kind) {
    case 'docker-unavailable':
      return {
        title: 'Docker is not available.',
        message: 'The docker executable could not be started from the current environment.',
        hints: [
          'Check that Docker Desktop or Docker Engine is installed and running.',
          'Check that the docker command is available in PATH for this terminal/session.',
          'Run compose doctor for local installation diagnostics.',
        ],
      };
    case 'compose-file-missing':
      return {
        title: 'Compose file was not found.',
        message: `Docker Compose could not read the configured Compose file: ${input.request.composeFilePath}`,
        hints: [
          'Check that the selected stack still exists on disk.',
          'Refresh the workspace scan before executing the command again.',
          'Check the configured workspace path if the file was moved or deleted.',
        ],
      };
    case 'compose-command-failed':
      return {
        title: 'Docker Compose command failed.',
        message: 'Docker Compose returned a non-zero exit code.',
        hints: [
          'Review stderr and stdout for the Docker Compose error details.',
          'Check that Docker is running and the selected services exist in the Compose file.',
          'Run the generated command manually when deeper Docker troubleshooting is required.',
        ],
      };
  }
}

function readErrorMessage(error: unknown): string {
  return isErrorLike(error) && typeof error.message === 'string' ? error.message : '';
}

function readErrorCode(error: unknown): string {
  return isErrorLike(error) && typeof error.code === 'string' ? error.code : '';
}

function isErrorLike(error: unknown): error is { message?: unknown; code?: unknown } {
  return typeof error === 'object' && error !== null;
}
