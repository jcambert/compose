import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  apiGet,
  apiPost,
  type BuiltComposeCommand,
  type ComposeExecutionResult,
  type CommandRequest,
  type DiscoveredComposeProject,
  type DoctorReport,
  type StackListResult,
  type StackRuntimeStatus,
  type WorkspaceListResult,
} from './api';

type AppProps = {
  token: string;
};

type LoadState = {
  loading: boolean;
  health?: { ok: boolean; host: string };
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

type CommandFormState = {
  command: string;
  serviceName: string;
  confirmed: boolean;
  destructiveConfirmed: boolean;
  busy: boolean;
  preview?: BuiltComposeCommand;
  execution?: ComposeExecutionResult;
  error?: string;
};

const commands = ['ps', 'up', 'down', 'logs', 'restart', 'stop', 'start', 'build', 'pull', 'kill', 'rm'];
const destructiveCommands = new Set(['down', 'kill', 'rm']);

export function App({ token }: AppProps) {
  const [state, setState] = useState<LoadState>({ loading: true });
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [runtime, setRuntime] = useState<RuntimeState>({ loading: false });
  const [form, setForm] = useState<CommandFormState>({
    command: 'ps',
    serviceName: '',
    confirmed: false,
    destructiveConfirmed: false,
    busy: false,
  });
  const selectedProject = useMemo(
    () => state.stacks?.stacks.find((project) => project.id === selectedId),
    [state.stacks, selectedId],
  );

  async function load() {
    setState({ loading: true });

    try {
      const [health, doctor, workspaces, stacks] = await Promise.all([
        apiGet<{ ok: boolean; host: string }>(token, '/api/health'),
        apiGet<DoctorReport>(token, '/api/doctor?skipDocker=true'),
        apiGet<WorkspaceListResult>(token, '/api/workspaces'),
        apiGet<StackListResult>(token, '/api/stacks'),
      ]);

      setState({ loading: false, health, doctor, workspaces, stacks });
      setSelectedId((current) => current ?? stacks.stacks[0]?.id);
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : 'Unable to load compose data.' });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (selectedProject === undefined) {
      setRuntime({ loading: false });
      return;
    }

    let cancelled = false;
    setRuntime({ loading: true });
    apiGet<StackRuntimeStatus>(token, `/api/stacks/${encodeURIComponent(selectedProject.id)}/runtime`)
      .then((status) => {
        if (!cancelled) {
          setRuntime({ loading: false, status });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRuntime({ loading: false, error: error instanceof Error ? error.message : 'Runtime unavailable.' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProject, token]);

  async function preview() {
    const request = createRequest(selectedProject, form);

    if (request === undefined) {
      return;
    }

    setForm((current) => ({ ...current, busy: true, error: undefined, preview: undefined, execution: undefined }));

    try {
      const result = await apiPost<BuiltComposeCommand>(token, '/api/commands/preview', request);
      setForm((current) => ({ ...current, busy: false, preview: result }));
    } catch (error) {
      setForm((current) => ({
        ...current,
        busy: false,
        error: error instanceof Error ? error.message : 'Unable to preview command.',
      }));
    }
  }

  async function execute() {
    const request = createRequest(selectedProject, form);

    if (request === undefined) {
      return;
    }

    setForm((current) => ({ ...current, busy: true, error: undefined, execution: undefined }));

    try {
      const result = await apiPost<ComposeExecutionResult>(token, '/api/commands/execute', request);
      setForm((current) => ({ ...current, busy: false, execution: result }));
    } catch (error) {
      setForm((current) => ({
        ...current,
        busy: false,
        error: error instanceof Error ? error.message : 'Unable to execute command.',
      }));
    }
  }

  const destructive = destructiveCommands.has(form.command);
  const canExecute = form.preview !== undefined && form.confirmed && (!destructive || form.destructiveConfirmed);

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">CLI-first · local-only · token-protected</p>
          <h1>compose UI</h1>
          <p className="muted">Bundled React UI for diagnostics, workspaces, stacks and safe Docker Compose command previews.</p>
        </div>
        <button className="secondary" type="button" onClick={() => void load()} disabled={state.loading}>
          Refresh
        </button>
      </header>

      {state.error === undefined ? null : <Banner tone="danger">{state.error}</Banner>}
      {state.loading ? <Banner tone="info">Loading local compose data...</Banner> : null}

      <section className="grid two-columns">
        <DoctorPanel report={state.doctor} />
        <WorkspacePanel workspaces={state.workspaces} health={state.health} />
      </section>

      <section className="grid two-columns wide-left">
        <StackListPanel
          stacks={state.stacks}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setForm((current) => ({ ...current, serviceName: '', preview: undefined, execution: undefined, error: undefined }));
          }}
        />
        <StackDetailPanel project={selectedProject} runtime={runtime} />
      </section>

      <CommandPanel
        project={selectedProject}
        form={form}
        setForm={setForm}
        destructive={destructive}
        canExecute={canExecute}
        preview={() => void preview()}
        execute={() => void execute()}
      />
    </main>
  );
}

function DoctorPanel({ report }: { report?: DoctorReport }) {
  const checks = report?.checks ?? [];

  return (
    <Panel title="Doctor" subtitle="Local diagnostics">
      {report === undefined ? (
        <p className="muted">No diagnostic report loaded.</p>
      ) : (
        <StatusPill tone={report.ok ? 'ok' : 'danger'}>{report.ok ? 'OK' : 'Issues found'}</StatusPill>
      )}
      <div className="check-list">
        {checks.length === 0 ? (
          <p className="muted">No checks returned.</p>
        ) : (
          checks.map((check) => (
            <article key={check.id} className={`check-row ${check.status}`}>
              <strong>{check.name}</strong>
              <span>{check.message}</span>
              {check.details === undefined ? null : <small>{check.details}</small>}
            </article>
          ))
        )}
      </div>
    </Panel>
  );
}

function WorkspacePanel({ workspaces, health }: { workspaces?: WorkspaceListResult; health?: { host: string } }) {
  const entries = workspaces?.workspaces ?? [];

  return (
    <Panel title="Workspaces" subtitle={health === undefined ? 'Local server' : `Server ${health.host}`}>
      {workspaces?.currentWorkspaceName === undefined ? (
        <p className="muted">No current workspace configured.</p>
      ) : (
        <StatusPill tone="ok">Current: {workspaces.currentWorkspaceName}</StatusPill>
      )}
      <div className="list">
        {entries.length === 0 ? (
          <p className="muted">No workspace saved yet.</p>
        ) : (
          entries.map((workspace) => (
            <article key={workspace.name} className="list-item">
              <strong>{workspace.name}</strong>
              <span>{workspace.path}</span>
            </article>
          ))
        )}
      </div>
    </Panel>
  );
}

function StackListPanel({
  stacks,
  selectedId,
  onSelect,
}: {
  stacks?: StackListResult;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const projects = stacks?.stacks ?? [];

  return (
    <Panel title="Stacks" subtitle={stacks === undefined ? 'Compose projects' : `${projects.length} stacks · ${stacks.root}`}>
      <div className="stack-list">
        {projects.length === 0 ? (
          <p className="muted">No Compose stack found.</p>
        ) : (
          projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={project.id === selectedId ? 'stack-card selected' : 'stack-card'}
              onClick={() => onSelect(project.id)}
            >
              <strong>{project.name}</strong>
              <span>
                {project.services.length} services · {project.relativePath}
              </span>
            </button>
          ))
        )}
      </div>
    </Panel>
  );
}

function StackDetailPanel({ project, runtime }: { project?: DiscoveredComposeProject; runtime: RuntimeState }) {
  const services = project?.services ?? [];
  const status = runtime.status;

  return (
    <Panel title="Stack detail" subtitle={project?.composeFilePath ?? 'Select a stack'}>
      {project === undefined ? (
        <p className="muted">Select a stack to inspect services and runtime status.</p>
      ) : (
        <>
          <div className="status-line">
            <StatusPill tone={status?.available === false ? 'warning' : 'ok'}>
              {runtime.loading ? 'Loading runtime...' : status?.summary ?? 'Runtime unknown'}
            </StatusPill>
            {runtime.error === undefined ? null : <span className="danger-text">{runtime.error}</span>}
          </div>
          {status?.warning === undefined ? null : <Banner tone="warning">{status.warning}</Banner>}
          <div className="service-grid">
            {services.map((service) => {
              const serviceStatus = status?.services?.[service];

              return (
                <article key={service} className="service-card">
                  <strong>{service}</strong>
                  <span>
                    {serviceStatus?.state ?? 'unknown'} · {serviceStatus?.containerCount ?? 0} containers
                  </span>
                  {serviceStatus?.ports === undefined || serviceStatus.ports.length === 0 ? null : (
                    <small>{serviceStatus.ports.join(', ')}</small>
                  )}
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
  form,
  setForm,
  destructive,
  canExecute,
  preview,
  execute,
}: {
  project?: DiscoveredComposeProject;
  form: CommandFormState;
  setForm: React.Dispatch<React.SetStateAction<CommandFormState>>;
  destructive: boolean;
  canExecute: boolean;
  preview: () => void;
  execute: () => void;
}) {
  const services = project?.services ?? [];

  return (
    <Panel title="Command preview" subtitle="Always inspect the Docker command before execution">
      {project === undefined ? <p className="muted">Select a stack before previewing a command.</p> : null}
      <div className="command-grid">
        <label>
          Command
          <select
            value={form.command}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                command: event.target.value,
                preview: undefined,
                execution: undefined,
                error: undefined,
              }))
            }
          >
            {commands.map((command) => (
              <option key={command} value={command}>
                {command}
              </option>
            ))}
          </select>
        </label>
        <label>
          Service
          <select
            value={form.serviceName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                serviceName: event.target.value,
                preview: undefined,
                execution: undefined,
                error: undefined,
              }))
            }
          >
            <option value="">All services / stack level</option>
            {services.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="actions">
        <button type="button" onClick={preview} disabled={project === undefined || form.busy}>
          Preview
        </button>
        <button className="danger" type="button" onClick={execute} disabled={!canExecute || form.busy}>
          Execute
        </button>
      </div>

      <div className="checkbox-row">
        <label>
          <input
            type="checkbox"
            checked={form.confirmed}
            onChange={(event) => setForm((current) => ({ ...current, confirmed: event.target.checked }))}
          />
          I confirm execution
        </label>
        {destructive ? (
          <label>
            <input
              type="checkbox"
              checked={form.destructiveConfirmed}
              onChange={(event) => setForm((current) => ({ ...current, destructiveConfirmed: event.target.checked }))}
            />
            I confirm destructive execution
          </label>
        ) : null}
      </div>

      {form.error === undefined ? null : <Banner tone="danger">{form.error}</Banner>}
      {form.preview === undefined ? null : (
        <div className="code-block">
          <strong>Preview</strong>
          <pre>{form.preview.displayCommand}</pre>
        </div>
      )}
      {form.execution === undefined ? null : (
        <div className="code-block">
          <strong>Execution result</strong>
          <pre>
            {[
              `command: ${form.execution.command}`,
              `exitCode: ${form.execution.exitCode}`,
              form.execution.stdout === '' ? undefined : `stdout:\n${form.execution.stdout}`,
              form.execution.stderr === '' ? undefined : `stderr:\n${form.execution.stderr}`,
            ]
              .filter(Boolean)
              .join('\n\n')}
          </pre>
        </div>
      )}
    </Panel>
  );
}

function createRequest(project: DiscoveredComposeProject | undefined, form: CommandFormState): CommandRequest | undefined {
  if (project === undefined) {
    return undefined;
  }

  return {
    command: form.command,
    composeFilePath: project.composeFilePath,
    services: form.serviceName === '' ? [] : [form.serviceName],
    options: {},
    confirmed: form.confirmed,
    destructiveConfirmed: form.destructiveConfirmed,
  };
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
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

function Banner({ tone, children }: { tone: 'info' | 'warning' | 'danger'; children: React.ReactNode }) {
  return <div className={`banner ${tone}`}>{children}</div>;
}

function StatusPill({ tone, children }: { tone: 'ok' | 'warning' | 'danger'; children: React.ReactNode }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}
