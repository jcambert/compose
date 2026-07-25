import { dirname } from 'node:path';
import type { BuiltComposeCommand, ComposeExecutionRequest, ComposeSubCommand } from './compose-command.js';

const commandOptionBuilders: Record<ComposeSubCommand, (args: string[], request: ComposeExecutionRequest) => void> = {
  up(args, request): void {
    addBoolean(args, request.options.detach, '-d');
    addBoolean(args, request.options.removeOrphans, '--remove-orphans');
    addBoolean(args, request.options.build, '--build');
    addRepeatableOption(args, '--scale', request.options.scale);
    args.push(...request.services);
  },
  down(args, request): void {
    addBoolean(args, request.options.removeOrphans, '--remove-orphans');
    addBoolean(args, request.options.volumes, '--volumes');
  },
  ps(args, request): void {
    args.push(...request.services);
  },
  logs(args, request): void {
    addBoolean(args, request.options.follow, '--follow');
    addValueOption(args, '--tail', request.options.tail);
    args.push(...request.services);
  },
  build(args, request): void {
    addBoolean(args, request.options.noCache, '--no-cache');
    addBoolean(args, request.options.pull, '--pull');
    args.push(...request.services);
  },
  pull(args, request): void {
    args.push(...request.services);
  },
  restart(args, request): void {
    args.push(...request.services);
  },
  exec(args, request): void {
    addRepeatableOption(args, '--env', request.options.env);
    addValueOption(args, '--user', request.options.user);
    addValueOption(args, '--workdir', request.options.workdir);
    args.push(...request.services, ...request.passthroughArgs);
  },
  run(args, request): void {
    addBoolean(args, request.options.rm, '--rm');
    addRepeatableOption(args, '--env', request.options.env);
    args.push(...request.services, ...request.passthroughArgs);
  },
  stop(args, request): void {
    args.push(...request.services);
  },
  start(args, request): void {
    args.push(...request.services);
  },
  config(): void {
    return;
  },
};

export function buildComposeCommand(request: ComposeExecutionRequest): BuiltComposeCommand {
  const args = ['compose', '-f', request.composeFilePath];

  addValueOption(args, '--project-name', request.options.projectName);
  addRepeatableOption(args, '--profile', request.options.profile);
  addBoolean(args, request.options.noAnsi, '--ansi=never');

  args.push(request.command);
  commandOptionBuilders[request.command](args, request);

  const cwd = request.workingDirectory ?? dirname(request.composeFilePath);

  return {
    binary: 'docker',
    args,
    cwd,
    displayCommand: formatCommand('docker', args),
  };
}

function addBoolean(args: string[], enabled: boolean | undefined, flag: string): void {
  if (enabled === true) {
    args.push(flag);
  }
}

function addValueOption(args: string[], flag: string, value: string | undefined): void {
  if (value !== undefined && value.length > 0) {
    args.push(flag, value);
  }
}

function addRepeatableOption(args: string[], flag: string, values: string[] | undefined): void {
  for (const value of values ?? []) {
    args.push(flag, value);
  }
}

function formatCommand(binary: string, args: string[]): string {
  return [binary, ...args].map(quoteShellArg).join(' ');
}

function quoteShellArg(value: string): string {
  if (/^[a-zA-Z0-9_./:@=,+-]+$/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('\\\\', '\\\\\\\\').replaceAll('"', '\\"')}"`;
}
