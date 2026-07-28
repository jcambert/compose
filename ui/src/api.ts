import type {
  CommandExecutionResult,
  CommandPreview,
  CommandRequest,
  DiscoveredComposeProject,
  DoctorReport,
  HealthResult,
  StackListResult,
  StackRuntimeStatus,
  WorkspaceListResult,
} from './types';

declare global {
  interface Window {
    __COMPOSE_UI_TOKEN__?: string;
  }
}

export type ComposeUiApi = {
  health: () => Promise<HealthResult>;
  doctor: () => Promise<DoctorReport>;
  workspaces: () => Promise<WorkspaceListResult>;
  stacks: () => Promise<StackListResult>;
  runtime: (project: DiscoveredComposeProject) => Promise<StackRuntimeStatus>;
  preview: (request: CommandRequest) => Promise<CommandPreview>;
  execute: (request: CommandRequest) => Promise<CommandExecutionResult>;
};

export function createComposeUiApi(): ComposeUiApi {
  const token = readLocalToken();

  return {
    health: () => requestJson<HealthResult>('/api/health', token),
    doctor: () => requestJson<DoctorReport>('/api/doctor?skipDocker=true', token),
    workspaces: () => requestJson<WorkspaceListResult>('/api/workspaces', token),
    stacks: () => requestJson<StackListResult>('/api/stacks', token),
    runtime: (project) => requestJson<StackRuntimeStatus>(`/api/stacks/${encodeURIComponent(project.id)}/runtime`, token),
    preview: (request) => postJson<CommandPreview>('/api/commands/preview', token, request),
    execute: (request) => postJson<CommandExecutionResult>('/api/commands/execute', token, request),
  };
}

async function requestJson<T>(path: string, token: string): Promise<T> {
  const response = await fetch(path, {
    headers: createHeaders(token),
  });

  return readJsonResponse<T>(response);
}

async function postJson<T>(path: string, token: string, body: CommandRequest): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      ...createHeaders(token),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return readJsonResponse<T>(response);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const value = await response.json() as unknown;

  if (!response.ok) {
    const message = readErrorMessage(value) ?? `Request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return value as T;
}

function createHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
  };
}

function readLocalToken(): string {
  const token = window.__COMPOSE_UI_TOKEN__;

  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Missing local compose UI token. Restart compose ui from the CLI.');
  }

  return token;
}

function readErrorMessage(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const error = (value as { error?: unknown }).error;

  if (typeof error !== 'object' || error === null || Array.isArray(error)) {
    return undefined;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : undefined;
}
