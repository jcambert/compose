import { execa } from 'execa';
import { buildComposeCommand } from './compose-command-builder.js';
import type { ComposeExecutionRequest } from './compose-command.js';

export type ComposeExecutionResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ProcessRunner = (
  binary: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

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

  const result = await runner(builtCommand.binary, builtCommand.args, { cwd: builtCommand.cwd });

  return {
    command: builtCommand.displayCommand,
    ...result,
  };
}

async function defaultProcessRunner(
  binary: string,
  args: string[],
  options: { cwd: string },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await execa(binary, args, {
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
}
