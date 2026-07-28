import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createComposeUiApi } from './api';
import type {
  CommandExecutionResult,
  CommandPreview,
  CommandRequest,
  ComposeSubCommand,
  DiscoveredComposeProject,
  DoctorCheck,
  DoctorReport,
  HealthResult,
  StackListResult,
  StackRuntimeStatus,
  WorkspaceListResult,
} from './types';

const commandOptions = ['ps', 'up', 'down', 'logs', 'restart', 'stop', 'start', 'build', 'pull', 'kill', 'rm'] as const;
const destructiveCommands = new Set<ComposeSubCommand>(['down', 'kill', 'rm']);

type DashboardState = {
  loading: boolean;
  health?: HealthResult;
  doctor?: DoctorReport;
  workspaces?: WorkspaceListResult;
  stacks?: StackListResult;
  error?: string;
};

type RuntimeState = {
  loading: boolean;
  status?: StackRuntimeStatus;
  error?: string;
};

type CommandState = {
  command: ComposeSubCommand;
  serviceName: string;
  confirmed: boolean;
  destructiveConfirmed: boolean;
  preview?: CommandPreview;
  execution?: CommandExecutionResult;
  error?: string;
  busy: boolean;
};

export function App(): ReactNode {
  const api = useMemo(() => createComposeUiApi(), []);
  const [dashboard, setDashboard] = useState<DashboardState>({ loading: true });
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [runtime, setRuntime] = useState<RuntimeState>({ loading: false });
  const [commandState, setCommandState] = useState<CommandState>({
    command: 'ps',
    serviceName: '',
    confirmed: false,
    destructiveConfirmed: false,
    busy: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard(): Promise<void> {
      setDashboard({ loading: true });

      try {
        const [health, doctor, workspaces, stacks] = await Promise.all([
          api.health(),
          api.doctor(),
          api.workspaces(),
          api.stacks(),
        ]);

        if (!cancelled) {
          setDashboard({ loading: false, health, doctor, workspaces, stacks });
          setSelectedProjectId((current) => current ?? stacks.stacks[0]?.id);
        }
      } catch (error) {
        if (!cancelled) {
          setDashboard({ loading: false, error: error instanceof Error ? error.message : 'Unable to load compose UI data.' });
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [api]);

  const selectedProject = useMemo(() => {
    return dashboard.stacks?.stacks.find((stack) => stack.id === selectedProjectId);
  }, [dashboard.stacks, selectedProjectId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRuntime(project: DiscoveredComposeProject): Promise<void> {
      setRuntime({ loading: true });

      try {
        const status = await api.runtime(project);

        if (!cancelled) {
          setRuntime({ loading: false, status });
        }
      } catch (error) {
        if (!cancelled) {
          setRuntime({ loading: false, error: error instanceof Error ? error.message : 'Unable to read runtime status.' });
        }
      }
    }

    if (selectedProject === undefined) {
      setRuntime({ loading: false });
      return () => {
        cancelled = true;
      };
    }

    void loadRuntime(selectedProject);

    return () => {
      cancelled = true;
    };
  }, [api, selectedProject]);

  async function refresh(): Promise<void> {
    setDashboard({ loading: true });

    try {
      const [health, doctor, workspaces, stacks] = await Promise.all([
        api.health(),
        api.doctor(),
        api.workspaces(),
        api.stacks(),
      ]);
      setDashboard({ loading: false, health, doctor, workspaces, stacks });
      setSelectedProjectId((current) => current ?? stacks.stacks[0]?.id);
    } catch (error) {
      setDashboard({ loading: false, error: error instanceof Error ? error.message : 'Unable to refresh compose UI data.' });
    }
  }

  async function previewCommand(): Promise<void> {
    const request = createCommandRequest(selectedProject, commandState);

    if (request === undefined) {
      return;
    }

    setCommandState((current) => ({ ...current, busy: true, error: undefined, preview: undefined, execution: undefined }));

    try {
      const preview = await api.preview(request);
      setCommandState((current) => ({ ...current, busy: false, preview }));
    } catch (error) {
      setCommandState((current) => ({
        ...current,
        busy: false,
        error: error instanceof Error ? error.message : 'Unable to preview command.',
      }));
    }
  }

  async function executeCommand(): Promise<void> {
    const request = createCommandRequest(selectedProject, commandState);

    if (request === undefined) {
      return;
    }

    setCommandState((current) => ({ ...current, busy: true, error: undefined, execution: undefined }));

    try {
      const execution = await api.execute(request);
      setCommandState((current) => ({ ...current, busy: false, execution }));
    } catch (error) {
      setCommandState((current) => ({
        ...current,
        busy: false,
        error: error instanceof Error ? error.message : 'Unable to execute command.',
      }));
    }
  }

  const destructive = destructiveCommands.has(commandState.command);
  const canExecute = commandState.preview !== undefined && commandState.confirmed && (!destructive || commandState.destructiveConfirmed);

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">CLI-first · local-only · token-protected</p>
          <h1>compose UI</h1>
          <p className="muted">React MVP for inspecting diagnostics, workspaces, stacks and safe Docker Compose command previews.</p>
        </div>
        <button type="button" className="secondary" onClick={() => void refresh()} disabled={dashboard.loading}>
          Refresh
        </button>
      </header>

      {dashboard.error === undefined ? null : <Banner tone="danger">{dashboard.error}</Banner>}
      {dashboard.loading ? <Banner tone="info">Loading local compose data...</Banner> : null}

      <section className="grid two-columns">
        <DoctorPanel report={dashboard.doctor} />
        <WorkspacePanel workspaces={dashboard.workspaces} health={dashboard.health} />
      </section>

      <section className="grid two-columns wide-left">
        <StackListPanel
          stacks={dashboard.stacks}
          selectedProjectId={selectedProjectId}
          onSelect={(projectId) => {
            setSelectedProjectId(projectId);
            setCommandState((current) => ({
              ...current,
              serviceName: '',
              preview: undefined,
              execution: undefined,
              error: undefined,
            }));
          }}
        />
        <StackDetailPanel project={selectedProject} runtime={runtime} />
      </section>

      <CommandPanel
        project={selectedProject}
        commandState={commandState}
        destructive={destructive}
        canExecute={canExecute}
        onChange={setCommandState}
        onPreview={() => void previewCommand()}
        onExecute={() => void executeCommand()}
      />
    </main>
  );
}

function DoctorPanel({ report }: { report?: DoctorReport }): ReactNode {
  const checks = report?.checks ?? [];

  return (
    <Panel title="Doctor" subtitle="Local diagnostics">
      {report === undefined ? <p className="muted">No diagnostic report loaded.</p> : null}
      {report === undefined ? null : (
        <>
          <StatusPill tone={report.ok ? 'ok' : 'danger'}>{report.ok ? 'OK' : 'Issues found'}</StatusPill>
          <div className="check-list">
            {checks.length === 0 ? <p className="muted">No checks returned.</p> : null}
            {checks.map((check) => <DoctorCheckRow key={check.id} check={check} />)}
          </div>
        </>
      )}
    </Panel>
  );
}

function DoctorCheckRow({ check }: { check: DoctorCheck }): ReactNode {
  return (
    <article className={`check-row ${check.status}`}>
      <strong>{check.name}</strong>
      <span>{check.message}</span>
      {check.details === undefined ? null : <small>{check.details}</small>}
    </article>
  );
}

function WorkspacePanel({ workspaces, health }: { workspaces?: WorkspaceListResult; health?: HealthResult }): ReactNode {
  const entries = workspaces?.workspaces ?? [];

  return (
    <Panel title="Workspaces" subtitle={health === undefined ? 'Local server' : `Server ${health.host}`}>
      {workspaces?.currentWorkspaceName === undefined ? <p className="muted">No current workspace configured.</p> : null}
      {workspaces?.currentWorkspaceName === undefined ? null : <StatusPill tone="ok">Current: {workspaces.currentWorkspaceName}</StatusPill>}
      <div className="list">
        {entries.length === 0 ? <p className="muted">No workspace saved yet.</p> : null}
        {entries.map((workspace) => (
          <article key={workspace.name} className="list-item">
            <strong>{workspace.name}</strong>
            <span>{workspace.path}</span>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function StackListPanel({
  stacks,
  selectedProjectId,
  onSelect,
}: {
  stacks?: StackListResult;
  selectedProjectId?: string;
  onSelect: (projectId: string) => void;
}): ReactNode {
  const projects = stacks?.stacks ?? [];

  return (
    <Panel title="Stacks" subtitle={stacks === undefined ? 'Compose projects' : `${projects.length} stacks · ${stacks.root}`}>
      <div className="stack-list">
        {projects.length === 0 ? <p className="muted">No Compose stack found.</p> : null}
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            className={project.id === selectedProjectId ? 'stack-card selected' : 'stack-card'}
            onClick={() => onSelect(project.id)}
          >
            <strong>{project.name}</strong>
            <span>{project.services.length} services · {project.relativePath}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function StackDetailPanel({ project, runtime }: { project?: DiscoveredComposeProject; runtime: RuntimeState }): ReactNode {
  const services = project?.services ?? [];

  return (
    <Panel title="Stack detail" subtitle={project?.composeFilePath ?? 'Select a stack'}>
      {project === undefined ? <p className="muted">Select a stack to inspect services and runtime status.</p> : null}
      {project === undefined ? null : (
        <>
          <div className="status-line">
            <StatusPill tone={runtime.status?.available === false ? 'warning' : 'ok'}>
              {runtime.loading ? 'Loading runtime...' : runtime.status?.summary ?? 'Runtime unknown'}
            </StatusPill>
            {runtime.error === undefined ? null : <span className="danger-text">{runtime.error}</span>}
          </div>
          {runtime.status?.warning === undefined ? null : <Banner tone="warning">{runtime.status.warning}</Banner>}
          <div className="service-grid">
            {services.map((service) => {
              const serviceStatus = runtime.status?.services[service];
              return (
                <article key={service} className="service-card">
                  <strong>{service}</strong>
                  <span>{serviceStatus?.state ?? 'unknown'} · {serviceStatus?.containerCount ?? 0} containers</span>
                  {serviceStatus?.ports.length === 0 || serviceStatus?.ports === undefined ? null : <small>{serviceStatus.ports.join(', ')}</small>}
                </article>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}

function CommandPanel({
  project,
  commandState,
  destructive,
  canExecute,
  onChange,
  onPreview,
  onExecute,
}: {
  project?: DiscoveredComposeProject;
  commandState: CommandState;
  destructive: boolean;
  canExecute: boolean;
  onChange: (state: CommandState | ((state: CommandState) => CommandState)) => void;
  onPreview: () => void;
  onExecute: () => void;
}): ReactNode {
  const services = project?.services ?? [];

  return (
    <Panel title="Command preview" subtitle="Always inspect the Docker command before execution">
      {project === undefined ? <p className="muted">Select a stack before previewing a command.</p> : null}
      <div className="command-grid">
        <label>
          Command
          <select
            value={commandState.command}
            onChange={(event) => onChange((current) => ({
              ...current,
              command: event.target.value as ComposeSubCommand,
              preview: undefined,
              execution: undefined,
              error: undefined,
            }))}
          >
            {commandOptions.map((command) => <option key={command} value={command}>{command}</option>)}
          </select>
        </label>
        <label>
          Service
          <select
            value={commandState.serviceName}
            onChange={(event) => onChange((current) => ({
              ...current,
              serviceName: event.target.value,
              preview: undefined,
              execution: undefined,
              error: undefined,
            }))}
          >
            <option value="">All services / stack level</option>
            {services.map((service) => <option key={service} value={service}>{service}</option>)}
          </select>
        </label>
      </div>

      <div className="checkbox-row">
        <label>
          <input
            type="checkbox"
            checked={commandState.confirmed}
            onChange={(event) => onChange((current) => ({ ...current, confirmed: event.target.checked }))}
          />
          I confirm command execution
        </label>
        {destructive ? (
          <label>
            <input
              type="checkbox"
              checked={commandState.destructiveConfirmed}
              onChange={(event) => onChange((current) => ({ ...current, destructiveConfirmed: event.target.checked }))}
            />
            I understand this is destructive
          </label>
        ) : null}
      </div>

      <div className="actions">
        <button type="button" onClick={onPreview} disabled={project === undefined || commandState.busy}>
          Preview command
        </button>
        <button type="button" className="danger" onClick={onExecute} disabled={!canExecute || commandState.busy}>
          Execute
        </button>
      </div>

      {commandState.error === undefined ? null : <Banner tone="danger">{commandState.error}</Banner>}
      {commandState.preview === undefined ? null : <CodeBlock title="Generated command">{commandState.preview.displayCommand}</CodeBlock>}
      {commandState.execution === undefined ? null : (
        <CodeBlock title={`Execution result · exit ${commandState.execution.exitCode}`}>
          {[commandState.execution.stdout, commandState.execution.stderr].filter((part) => part.length > 0).join('\n') || commandState.execution.command}
        </CodeBlock>
      )}
    </Panel>
  );
}

function createCommandRequest(project: DiscoveredComposeProject | undefined, state: CommandState): CommandRequest | undefined {
  if (project === undefined) {
    return undefined;
  }

  const services = state.serviceName.length === 0 ? [] : [state.serviceName];
  const options = state.command === 'up'
    ? { detach: true, noAnsi: true }
    : state.command === 'logs'
      ? { tail: '100', noAnsi: true }
      : { noAnsi: true };

  return {
    command: state.command,
    composeFilePath: project.composeFilePath,
    services,
    options,
    confirmed: state.confirmed,
    destructiveConfirmed: state.destructiveConfirmed,
  };
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }): ReactNode {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        <span>{subtitle}</span>
      </div>
      {children}
    </section>
  );
}

function Banner({ tone, children }: { tone: 'info' | 'warning' | 'danger'; children: ReactNode }): ReactNode {
  return <div className={`banner ${tone}`}>{children}</div>;
}

function StatusPill({ tone, children }: { tone: 'ok' | 'warning' | 'danger'; children: ReactNode }): ReactNode {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

function CodeBlock({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <div className="code-block">
      <strong>{title}</strong>
      <pre>{children}</pre>
    </div>
  );
}
