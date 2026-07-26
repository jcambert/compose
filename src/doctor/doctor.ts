import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execa } from 'execa';
import { createWorkspaceStore, getCurrentWorkspace } from '../workspace/workspace-store.js';
import type { WorkspaceStore } from '../workspace/workspace-store.js';

export type DoctorCheckStatus = 'ok' | 'warning' | 'error';

export type DoctorCheck = {
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

export type DoctorOptions = {
  strict?: boolean;
  skipDocker?: boolean;
  nodeVersion?: string;
  workspaceStore?: WorkspaceStore;
  commandRunner?: DoctorCommandRunner;
};

type ExecaDoctorResultLike = {
  exitCode?: number | null;
  stdout?: unknown;
  stderr?: unknown;
};

type ExecaDoctorLike = (binary: string, args: string[], options: { reject: false }) => Promise<ExecaDoctorResultLike>;

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
  const checks = [
    checkNodeVersion(options.nodeVersion ?? process.versions.node),
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

function checkNodeVersion(version: string): DoctorCheck {
  const parsedVersion = parseNodeVersion(version);

  if (parsedVersion === undefined) {
    return {
      name: 'Node.js',
      status: 'error',
      message: `Unable to parse Node.js version ${version}.`,
      details: 'Expected a semver value such as 20.19.0.',
    };
  }

  if (!isAtLeast(parsedVersion, minimumNodeVersion)) {
    return {
      name: 'Node.js',
      status: 'error',
      message: `Node.js ${version} is below the required 20.19.0 runtime.`,
      details: 'Install Node.js 20.19.0 or newer before using compose.',
    };
  }

  return {
    name: 'Node.js',
    status: 'ok',
    message: `Node.js ${version} is supported.`,
  };
}

async function checkDocker(skipDocker: boolean, commandRunner: DoctorCommandRunner): Promise<DoctorCheck[]> {
  if (skipDocker) {
    return [
      {
        name: 'Docker',
        status: 'warning',
        message: 'Docker checks were skipped.',
        details: 'Run compose doctor without --skip-docker to verify Docker and Docker Compose.',
      },
    ];
  }

  const dockerVersion = await runDiagnosticCommand(commandRunner, 'docker', ['--version'], 'Docker');
  const composeVersion = await runDiagnosticCommand(commandRunner, 'docker', ['compose', 'version'], 'Docker Compose');

  return [dockerVersion, composeVersion];
}

async function runDiagnosticCommand(
  commandRunner: DoctorCommandRunner,
  binary: string,
  args: string[],
  name: string,
): Promise<DoctorCheck> {
  const result = await commandRunner(binary, args);
  const output = result.stdout.trim() || result.stderr.trim();

  if (result.exitCode !== 0) {
    return {
      name,
      status: 'error',
      message: `${name} is not available.`,
      ...(output.length === 0 ? {} : { details: output }),
    };
  }

  return {
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
      name: 'User config',
      status: 'ok',
      message: 'User config directory is readable and writable.',
      details: workspaceStore.configPath,
    };
  } catch (error) {
    return {
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
        name: 'Workspace',
        status: 'warning',
        message: 'No current workspace is configured.',
        details: 'Run compose workspace add <name> <path> then compose workspace use <name>.',
      };
    }

    return {
      name: 'Workspace',
      status: 'ok',
      message: `Current workspace is ${currentWorkspace.name}.`,
      details: currentWorkspace.path,
    };
  } catch (error) {
    return {
      name: 'Workspace',
      status: 'error',
      message: 'Unable to read workspace configuration.',
      details: error instanceof Error ? error.message : workspaceStore.configPath,
    };
  }
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
