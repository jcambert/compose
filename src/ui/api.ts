export type DoctorReport = {
  ok: boolean;
  exitCode: number;
  checks: Array<{
    id: string;
    name: string;
    status: 'ok' | 'warning' | 'error';
    message: string;
    details?: string;
  }>;
};

export type WorkspaceDefinition = {
  name: string;
  path: string;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkspaceListResult = {
  currentWorkspaceName?: string;
  workspaces: WorkspaceDefinition[];
};

export type DiscoveredComposeProject = {
  id: string;
  name: string;
  composeFilePath: string;
  relativePath: string;
  services: string[];
};

export type StackListResult = {
  root: string;
  workspaceName?: string;
  stacks: DiscoveredComposeProject[];
};

export type StackRuntimeStatus = {
  available: boolean;
  state: string;
  summary: string;
  warning?: string;
  services?: Record<string, {
    state: string;
    containerCount: number;
    ports?: string[];
    containerNames?: string[];
  }>;
};

export type BuiltComposeCommand = {
  displayCommand: string;
};

export type ComposeExecutionDiagnostic = {
  kind: 'docker-unavailable' | 'compose-file-missing' | 'compose-command-failed';
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

export type ComposeExecutionResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  diagnostic?: ComposeExecutionDiagnostic;
};

export type CommandRequest = {
  command: string;
  composeFilePath: string;
  services: string[];
  options: Record<string, unknown>;
  confirmed?: boolean;
  destructiveConfirmed?: boolean;
};

export async function apiGet<T>(token: string, path: string): Promise<T> {
  return api<T>(token, path);
}

export async function apiPost<T>(token: string, path: string, body: unknown): Promise<T> {
  return api<T>(token, path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export async function apiDelete<T>(token: string, path: string): Promise<T> {
  return api<T>(token, path, {
    method: 'DELETE',
  });
}

async function api<T>(token: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const value = await response.json() as T | { error?: { message?: string } };

  if (!response.ok) {
    const message = typeof value === 'object' && value !== null && 'error' in value && value.error?.message !== undefined
      ? value.error.message
      : `HTTP ${response.status}`;

    throw new Error(message);
  }

  return value as T;
}

export type ComposeEnvironmentEntry = {
  name: string;
  value: string;
};

export type ComposeServiceForm = {
  name: string;
  image?: string;
  build?: string;
  ports?: string[];
  environment?: ComposeEnvironmentEntry[];
  volumes?: string[];
  dependsOn?: string[];
  command?: string;
  restart?: string;
};

export type EditableComposeService = {
  name: string;
  image?: string;
  build?: string | Record<string, unknown>;
  ports: string[];
  environment: ComposeEnvironmentEntry[];
  volumes: string[];
  dependsOn: string[];
  command?: string | string[];
  restart?: string;
  readOnlyKeys: string[];
  preservedKeys: string[];
};

export type ComposeServiceListResult = {
  composeFilePath: string;
  contentHash: string;
  services: EditableComposeService[];
};

export type ComposeServiceMutationPreview = {
  operation: 'create' | 'update' | 'delete';
  composeFilePath: string;
  serviceName: string;
  originalContentHash: string;
  beforeYaml?: string;
  afterYaml?: string;
  diff: string;
  nextContent: string;
  validation: { success: true; errors: [] };
  warnings: string[];
};

export type ComposeServiceMutationCommitResult = {
  composeFilePath: string;
  operation: 'create' | 'update' | 'delete';
  serviceName: string;
  contentHash: string;
};
