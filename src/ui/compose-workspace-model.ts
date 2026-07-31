import type {
  CommandRequest,
  ComposeExecutionResult,
  StackRuntimeStatus,
} from './api.js';

export function createStackCommandRequest(
  composeFilePath: string,
  command: CommandRequest['command'],
  services: string[] = [],
  options: Record<string, unknown> = {},
): CommandRequest {
  return {
    composeFilePath,
    command,
    services,
    options,
    confirmed: true,
    destructiveConfirmed: command === 'down' || command === 'kill' || command === 'rm',
  };
}

export function isStackActive(runtime: StackRuntimeStatus | undefined): boolean {
  if (runtime?.available !== true) return false;
  if (runtime.state === 'running' || runtime.state === 'partial') return true;
  return Object.values(runtime.services ?? {}).some((service) =>
    ['running', 'healthy', 'unhealthy', 'restarting'].includes(service.state.toLowerCase()));
}

export function executionFailureMessage(result: ComposeExecutionResult): string | undefined {
  if (result.exitCode === 0) return undefined;
  return result.diagnostic?.message
    || result.stderr.trim()
    || 'Docker Compose command failed.';
}

export function formatExecutionOutput(result: ComposeExecutionResult): string {
  const sections = [
    '$ ' + result.command,
    result.stdout.trim(),
    result.stderr.trim(),
    result.diagnostic === undefined
      ? ''
      : [
          result.diagnostic.title,
          result.diagnostic.message,
          ...result.diagnostic.hints.map((hint) => '- ' + hint),
        ].join('\n'),
    '[exit ' + result.exitCode + ']',
  ];

  return sections.filter((section) => section.length > 0).join('\n\n');
}

export function canDeleteStack(stackName: string, confirmation: string): boolean {
  return stackName.length > 0 && confirmation === stackName;
}
