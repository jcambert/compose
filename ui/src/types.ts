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

export type WorkspaceEntry = {
  name: string;
  path: string;
  current?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceListResult = {
  currentWorkspaceName?: string;
  workspaces: WorkspaceEntry[];
};

export type DiscoveredComposeProject = {
  id: string;
  name: string;
  composeFilePath: string;
  directoryPath: string;
  relativePath: string;
  services: string[];
  warnings: string[];
};

export type StackListResult = {
  root: string;
  workspaceName?: string;
  stacks: DiscoveredComposeProject[];
};

export type ServiceRuntimeState = 'running' | 'stopped' | 'exited' | 'unhealthy' | 'unknown';
export type StackRuntimeState = 'running' | 'partial' | 'stopped' | 'unavailable' | 'unknown';

export type ServiceRuntimeStatus = {
  serviceName: string;
  state: ServiceRuntimeState;
  containerCount: number;
  ports: string[];
  containerNames: string[];
  health?: string;
};

export type StackRuntimeStatus = {
  projectId: string;
  composeFilePath: string;
  available: boolean;
  state: StackRuntimeState;
  services: Record<string, ServiceRuntimeStatus>;
  runningServices: number;
  stoppedServices: number;
  unhealthyServices: number;
  unknownServices: number;
  summary: string;
  warning?: string;
};

export type ComposeSubCommand =
  | 'up'
  | 'down'
  | 'ps'
  | 'logs'
  | 'build'
  | 'pull'
  | 'restart'
  | 'stop'
  | 'start'
  | 'kill'
  | 'rm';

export type ComposeCommandOptions = {
  detach?: boolean;
  follow?: boolean;
  tail?: string;
  dryRun?: boolean;
  noAnsi?: boolean;
};

export type CommandRequest = {
  command: ComposeSubCommand;
  composeFilePath: string;
  services: string[];
  options: ComposeCommandOptions;
  confirmed?: boolean;
  destructiveConfirmed?: boolean;
};

export type CommandPreview = {
  binary: 'docker';
  args: string[];
  cwd: string;
  displayCommand: string;
};

export type CommandExecutionResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type HealthResult = {
  ok: boolean;
  host: string;
};
