import { execa } from 'execa';
import { buildComposeCommand } from './compose-command-builder.js';
import type { ComposeExecutionRequest } from './compose-command.js';
import { createComposeExecutionDiagnostic, type ComposeExecutionDiagnostic } from './compose-error-reporting.js';

export type ComposeExecutionResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  diagnostic?: ComposeExecutionDiagnostic;
};

export type ProcessRunner = (
  binary: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export type ExecaProcessOptions = {
  cwd: string;
  reject: false;
  stdout: 'inherit';
  stderr: 'inherit';
};

export type ExecaResultLike = {
  exitCode?: number | null;
  stdout?: unknown;
  stderr?: unknown;
};

export type ExecaLike = (
  binary: string,
  args: string[],
  options: ExecaProcessOptions,
) => Promise<ExecaResultLike>;

const defaultProcessRunner = createExecaProcessRunner(execa as unknown as ExecaLike);

export async function executeComposeCommand(
  request: ComposeExecutionRequest,
  runner: ProcessRunner = defaultProcessRunner,
): Promise<ComposeExecutionResult> {
  const builtCommand = buildComposeCommand(request);

  if (request.options.dryRun === true) {
    return {
      command: builtCommand.displayCommand,
      exitCode: 0,
      stdout: builtCommand.displayCommand,
      stderr: '',
    };
  }

  const result = await runProcessSafely(runner, builtCommand.binary, builtCommand.args, { cwd: builtCommand.cwd });
  const diagnostic = result.exitCode === 0
    ? undefined
    : createComposeExecutionDiagnostic({
      request,
      builtCommand,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      ...(result.error === undefined ? {} : { error: result.error }),
    });

  return {
    command: builtCommand.displayCommand,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(diagnostic === undefined ? {} : { diagnostic }),
  };
}

export function createExecaProcessRunner(execaRunner: ExecaLike): ProcessRunner {
  return async (
    binary: string,
    args: string[],
    options: { cwd: string },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
    const result = await execaRunner(binary, args, {
      cwd: options.cwd,
      reject: false,
      stdout: 'inherit',
      stderr: 'inherit',
    });

    return {
      exitCode: result.exitCode ?? 0,
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr: typeof result.stderr === 'string' ? result.stderr : '',
    };
  };
}

async function runProcessSafely(
  runner: ProcessRunner,
  binary: string,
  args: string[],
  options: { cwd: string },
): Promise<{ exitCode: number; stdout: string; stderr: string; error?: unknown }> {
  try {
    return await runner(binary, args, options);
  } catch (error) {
    return {
      exitCode: readNumericProperty(error, 'exitCode') ?? (readStringProperty(error, 'code') === 'ENOENT' ? 127 : 1),
      stdout: readStringProperty(error, 'stdout') ?? '',
      stderr: readStringProperty(error, 'stderr') ?? readStringProperty(error, 'message') ?? '',
      error,
    };
  }
}

function readNumericProperty(value: unknown, property: string): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const candidate = value[property];
  return typeof candidate === 'number' ? candidate : undefined;
}

function readStringProperty(value: unknown, property: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const candidate = value[property];
  return typeof candidate === 'string' ? candidate : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
