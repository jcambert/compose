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

export type ComposeExecutionResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
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
