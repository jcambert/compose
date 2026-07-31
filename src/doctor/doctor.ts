import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { platform as getDefaultPlatform } from 'node:os';
import { dirname, posix, win32 } from 'node:path';
import { execa } from 'execa';
import { resolvePackageVersion } from '../utils/package-metadata.js';
import { createWorkspaceStore, getCurrentWorkspace } from '../workspace/workspace-store.js';
import type { WorkspaceStore } from '../workspace/workspace-store.js';

export type DoctorCheckStatus = 'ok' | 'warning' | 'error';

export type DoctorCheck = {
  id: string;
  name: string;
  status: DoctorCheckStatus;
  message: string;
  details?: string;
};

export type DoctorReport = {
  ok: boolean;
  strict: boolean;
  checks: DoctorCheck[];
  exitCode: number;
};

export type DoctorCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type DoctorCommandRunner = (binary: string, args: string[]) => Promise<DoctorCommandResult>;

export type DoctorEnvironment = Record<string, string | undefined>;

export type DoctorOptions = {
  strict?: boolean;
  skipDocker?: boolean;
  nodeVersion?: string;
  cliVersion?: string;
  platform?: NodeJS.Platform;
  environment?: DoctorEnvironment;
  workspaceStore?: WorkspaceStore;
  commandRunner?: DoctorCommandRunner;
};

type ExecaDoctorResultLike = {
  exitCode?: number | null;
  stdout?: unknown;
  stderr?: unknown;
};

type ExecaDoctorLike = (binary: string, args: string[], options: { reject: false }) => Promise<ExecaDoctorResultLike>;

type NpmGlobalPrefixResult = {
  check: DoctorCheck;
  prefix?: string;
};

const minimumNodeVersion = {
  major: 20,
  minor: 19,
  patch: 0,
};

const defaultCommandRunner = createDoctorCommandRunner(execa as unknown as ExecaDoctorLike);

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const strict = options.strict === true;
  const workspaceStore = options.workspaceStore ?? createWorkspaceStore();
  const commandRunner = options.commandRunner ?? defaultCommandRunner;
  const currentPlatform = options.platform ?? getDefaultPlatform();
  const environment = options.environment ?? process.env;
  const npmGlobalPrefix = await checkNpmGlobalPrefix(commandRunner);
  const checks = [
    checkCliVersion(options.cliVersion ?? resolvePackageVersion()),
    checkNodeVersion(options.nodeVersion ?? process.versions.node),
    await checkComposeExecutable(commandRunner, currentPlatform),
    npmGlobalPrefix.check,
    ...(npmGlobalPrefix.prefix === undefined ? [] : [checkPathIncludesNpmGlobalPrefix(npmGlobalPrefix.prefix, currentPlatform, environment)]),
    ...(await checkDocker(options.skipDocker === true, commandRunner)),
    await checkConfigAccess(workspaceStore),
    await checkCurrentWorkspace(workspaceStore),
  ];
  const hasError = checks.some((check) => check.status === 'error');
  const hasWarning = checks.some((check) => check.status === 'warning');
  const ok = !hasError && (!strict || !hasWarning);

  return {
    ok,
    strict,
    checks,
    exitCode: ok ? 0 : 1,
  };
}

export function createDoctorCommandRunner(execaRunner: ExecaDoctorLike): DoctorCommandRunner {
  return async (binary: string, args: string[]): Promise<DoctorCommandResult> => {
    try {
      const result = await execaRunner(binary, args, { reject: false });

      return {
        exitCode: result.exitCode ?? 0,
        stdout: typeof result.stdout === 'string' ? result.stdout : '',
        stderr: typeof result.stderr === 'string' ? result.stderr : '',
      };
    } catch (error) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Command failed.',
      };
    }
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    `Compose doctor: ${report.ok ? 'OK' : 'issues found'}`,
    `Mode: ${report.strict ? 'strict' : 'standard'}`,
    '',
    ...report.checks.flatMap(formatDoctorCheck),
  ];

  return lines.join('\n');
}

function formatDoctorCheck(check: DoctorCheck): string[] {
  const status = formatStatus(check.status);
  const lines = [`${status} ${check.name}: ${check.message}`];

  if (check.details !== undefined && check.details.length > 0) {
    lines.push(`   ${check.details}`);
  }

  return lines;
}

function formatStatus(status: DoctorCheckStatus): string {
  const labels: Record<DoctorCheckStatus, string> = {
    ok: '✓',
    warning: '!',
    error: '✗',
  };

  return labels[status];
}

function checkCliVersion(version: string): DoctorCheck {
  if (version === '0.0.0') {
    return {
      id: 'compose-cli-version',
      name: 'compose CLI',
      status: 'warning',
      message: 'Unable to resolve the installed compose package version.',
      details: 'Package metadata could not be read. The CLI can still run, but release diagnostics are incomplete.',
    };
  }

  return {
    id: 'compose-cli-version',
    name: 'compose CLI',
    status: 'ok',
    message: `compose CLI ${version} is installed.`,
  };
}

function checkNodeVersion(version: string): DoctorCheck {
  const parsedVersion = parseNodeVersion(version);

  if (parsedVersion === undefined) {
    return {
      id: 'node-version',
      name: 'Node.js',
      status: 'error',
      message: `Unable to parse Node.js version ${version}.`,
      details: 'Expected a semver value such as 20.19.0.',
    };
  }

  if (!isAtLeast(parsedVersion, minimumNodeVersion)) {
    return {
      id: 'node-version',
      name: 'Node.js',
      status: 'error',
      message: `Node.js ${version} is below the required 20.19.0 runtime.`,
      details: 'Install Node.js 20.19.0 or newer before using compose.',
    };
  }

  return {
    id: 'node-version',
    name: 'Node.js',
    status: 'ok',
    message: `Node.js ${version} is supported.`,
  };
}

async function checkComposeExecutable(commandRunner: DoctorCommandRunner, currentPlatform: NodeJS.Platform): Promise<DoctorCheck> {
  const lookupCommand = currentPlatform === 'win32'
    ? { binary: 'where.exe', args: ['compose'] }
    : { binary: 'which', args: ['compose'] };
  const result = await commandRunner(lookupCommand.binary, lookupCommand.args);
  const output = getCommandOutput(result);
  const firstMatch = output.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0);

  if (result.exitCode !== 0 || firstMatch === undefined) {
    return {
      id: 'compose-executable',
      name: 'compose executable',
      status: 'warning',
      message: 'The compose command is not discoverable from PATH.',
      details: output.length === 0
        ? 'Reopen the terminal after npm global install, then run compose --version.'
        : output,
    };
  }

  return {
    id: 'compose-executable',
    name: 'compose executable',
    status: 'ok',
    message: 'The compose command is discoverable from PATH.',
    details: firstMatch,
  };
}

async function checkNpmGlobalPrefix(commandRunner: DoctorCommandRunner): Promise<NpmGlobalPrefixResult> {
  const result = await commandRunner('npm', ['prefix', '-g']);
  const output = getCommandOutput(result);
  const prefix = output.split(/\r?\n/)[0]?.trim() ?? '';

  if (result.exitCode !== 0 || prefix.length === 0) {
    return {
      check: {
        id: 'npm-global-prefix',
        name: 'npm global prefix',
        status: 'warning',
        message: 'Unable to resolve the npm global prefix.',
        details: output.length === 0
          ? 'Run npm prefix -g to verify the global installation directory.'
          : output,
      },
    };
  }

  return {
    check: {
      id: 'npm-global-prefix',
      name: 'npm global prefix',
      status: 'ok',
      message: 'npm global prefix resolved.',
      details: prefix,
    },
    prefix,
  };
}

function checkPathIncludesNpmGlobalPrefix(
  npmGlobalPrefix: string,
  currentPlatform: NodeJS.Platform,
  environment: DoctorEnvironment,
): DoctorCheck {
  const expectedExecutableDirectory = currentPlatform === 'win32' ? npmGlobalPrefix : posix.join(npmGlobalPrefix, 'bin');
  const pathValue = getEnvironmentPath(environment);

  if (pathValue.trim().length === 0) {
    return {
      id: 'path-npm-prefix',
      name: 'PATH',
      status: 'warning',
      message: 'PATH is empty or unavailable.',
      details: `Expected npm global executable directory: ${expectedExecutableDirectory}`,
    };
  }

  const expectedPath = normalizePathForComparison(expectedExecutableDirectory, currentPlatform);
  const pathEntries = splitPathEntries(pathValue, currentPlatform).map((entry) => normalizePathForComparison(entry, currentPlatform));

  if (!pathEntries.includes(expectedPath)) {
    return {
      id: 'path-npm-prefix',
      name: 'PATH',
      status: 'warning',
      message: 'npm global executable directory is not present in PATH.',
      details: `Add ${expectedExecutableDirectory} to PATH, then reopen the terminal.`,
    };
  }

  return {
    id: 'path-npm-prefix',
    name: 'PATH',
    status: 'ok',
    message: 'PATH includes the npm global executable directory.',
    details: expectedExecutableDirectory,
  };
}

async function checkDocker(skipDocker: boolean, commandRunner: DoctorCommandRunner): Promise<DoctorCheck[]> {
  if (skipDocker) {
    return [
      {
        id: 'docker-skipped',
        name: 'Docker',
        status: 'warning',
        message: 'Docker checks were skipped.',
        details: 'Run compose doctor without --skip-docker to verify Docker and Docker Compose.',
      },
    ];
  }

  const dockerVersion = await runDiagnosticCommand(commandRunner, 'docker', ['--version'], 'Docker', 'docker-cli');
  const composeVersion = await runDiagnosticCommand(commandRunner, 'docker', ['compose', 'version'], 'Docker Compose', 'docker-compose');

  return [dockerVersion, composeVersion];
}

async function runDiagnosticCommand(
  commandRunner: DoctorCommandRunner,
  binary: string,
  args: string[],
  name: string,
  id: string,
): Promise<DoctorCheck> {
  const result = await commandRunner(binary, args);
  const output = getCommandOutput(result);

  if (result.exitCode !== 0) {
    return {
      id,
      name,
      status: 'error',
      message: `${name} is not available.`,
      ...(output.length === 0 ? {} : { details: output }),
    };
  }

  return {
    id,
    name,
    status: 'ok',
    message: output.length === 0 ? `${name} command succeeded.` : output,
  };
}

async function checkConfigAccess(workspaceStore: WorkspaceStore): Promise<DoctorCheck> {
  try {
    const configDirectory = dirname(workspaceStore.configPath);
    await mkdir(configDirectory, { recursive: true });
    await access(configDirectory, constants.R_OK | constants.W_OK);

    return {
      id: 'user-config',
      name: 'User config',
      status: 'ok',
      message: 'User config directory is readable and writable.',
      details: workspaceStore.configPath,
    };
  } catch (error) {
    return {
      id: 'user-config',
      name: 'User config',
      status: 'error',
      message: 'User config path is not accessible.',
      details: error instanceof Error ? error.message : workspaceStore.configPath,
    };
  }
}

async function checkCurrentWorkspace(workspaceStore: WorkspaceStore): Promise<DoctorCheck> {
  try {
    const config = await workspaceStore.load();
    const currentWorkspace = getCurrentWorkspace(config);

    if (currentWorkspace === undefined) {
      return {
        id: 'current-workspace',
        name: 'Workspace',
        status: 'warning',
        message: 'No current workspace is configured.',
        details: 'Run compose workspace add <name> <path> then compose workspace use <name>.',
      };
    }

    return {
      id: 'current-workspace',
      name: 'Workspace',
      status: 'ok',
      message: `Current workspace is ${currentWorkspace.name}.`,
      details: currentWorkspace.path,
    };
  } catch (error) {
    return {
      id: 'current-workspace',
      name: 'Workspace',
      status: 'error',
      message: 'Unable to read workspace configuration.',
      details: error instanceof Error ? error.message : workspaceStore.configPath,
    };
  }
}

function getCommandOutput(result: DoctorCommandResult): string {
  return (result.stdout.trim() || result.stderr.trim()).trim();
}

function getEnvironmentPath(environment: DoctorEnvironment): string {
  return environment.PATH ?? environment.Path ?? '';
}

function splitPathEntries(pathValue: string, currentPlatform: NodeJS.Platform): string[] {
  const pathDelimiter = currentPlatform === 'win32' ? ';' : ':';
  return pathValue
    .split(pathDelimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizePathForComparison(value: string, currentPlatform: NodeJS.Platform): string {
  const unquoted = value.trim().replace(/^"|"$/g, '').replace(/[\\/]+$/g, '');
  const normalizedValue = (currentPlatform === 'win32' ? win32 : posix).normalize(unquoted);

  return currentPlatform === 'win32' ? normalizedValue.toLowerCase() : normalizedValue;
}

function parseNodeVersion(version: string): { major: number; minor: number; patch: number } | undefined {
  const match = version.match(/^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)/);
  const major = match?.groups?.major;
  const minor = match?.groups?.minor;
  const patch = match?.groups?.patch;

  if (major === undefined || minor === undefined || patch === undefined) {
    return undefined;
  }

  return {
    major: Number.parseInt(major, 10),
    minor: Number.parseInt(minor, 10),
    patch: Number.parseInt(patch, 10),
  };
}

function isAtLeast(
  version: { major: number; minor: number; patch: number },
  minimumVersion: { major: number; minor: number; patch: number },
): boolean {
  if (version.major !== minimumVersion.major) {
    return version.major > minimumVersion.major;
  }

  if (version.minor !== minimumVersion.minor) {
    return version.minor > minimumVersion.minor;
  }

  return version.patch >= minimumVersion.patch;
}
