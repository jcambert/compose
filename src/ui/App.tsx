import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ServicesView } from './ServicesView';
import { createPublishedPortLink } from './service-runtime-ui';
import {
  apiDelete,
  apiGet,
  apiPost,
  type BuiltComposeCommand,
  type CommandRequest,
  type ComposeExecutionResult,
  type DiscoveredComposeProject,
  type DoctorReport,
  type StackListResult,
  type StackRuntimeStatus,
  type WorkspaceDefinition,
  type WorkspaceListResult,
} from './api';

type AppProps = {
  token: string;
};

type AppView = 'dashboard' | 'workspaces' | 'stacks' | 'services' | 'doctor' | 'commands';
type StackSortMode = 'name' | 'path' | 'services' | 'runtime';
type RefreshInterval = 0 | 5000 | 10000 | 30000 | 60000;
type ServiceActionState = { serviceName?: string; command?: string; busy: boolean; message?: string; error?: string };
type Tone = 'ok' | 'warning' | 'danger';

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

type WorkspaceFormState = {
  name: string;
  path: string;
  busy: boolean;
  editingName?: string;
  message?: string;
  error?: string;
};

type DashboardSummary = {
  stackCount: number;
  serviceCount: number;
  workspaceLabel: string;
  workspaceCount: number;
  doctorIssues: number;
  runtimeLabel: string;
  selectedStackLabel: string;
};

const commands = ['ps', 'up', 'down', 'logs', 'restart', 'stop', 'start', 'build', 'pull', 'kill', 'rm'];
const destructiveCommands = new Set(['down', 'kill', 'rm']);

export function App({ token }: AppProps) {
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [state, setState] = useState<LoadState>({ loading: true });
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [runtime, setRuntime] = useState<RuntimeState>({ loading: false });
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(5000);
  const [serviceAction, setServiceAction] = useState<ServiceActionState>({ busy: false });
  const [stackSearch, setStackSearch] = useState('');
  const [stackSort, setStackSort] = useState<StackSortMode>('name');
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceFormState>({ name: '', path: '', busy: false });
  const [workspaceRemovalName, setWorkspaceRemovalName] = useState<string | undefined>();
  const [form, setForm] = useState<CommandFormState>({
    command: 'ps',
    serviceName: '',
    confirmed: false,
    destructiveConfirmed: false,
    busy: false,
  });

  const projects = state.stacks?.stacks ?? [];
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId),
    [projects, selectedId],
  );
  const visibleProjects = useMemo(
    () => sortProjects(filterProjects(projects, stackSearch), stackSort, selectedProject?.id),
    [projects, selectedProject?.id, stackSearch, stackSort],
  );
  const summary = useMemo(
    () => createDashboardSummary(state, selectedProject, runtime),
    [runtime, selectedProject, state],
  );

  async function load() {
    setState((current) => ({ ...current, loading: true, error: undefined }));

    try {
      const [health, doctor, workspaces, stacks] = await Promise.all([
        apiGet<{ ok: boolean; host: string }>(token, '/api/health'),
        apiGet<DoctorReport>(token, '/api/doctor?skipDocker=true'),
        apiGet<WorkspaceListResult>(token, '/api/workspaces'),
        apiGet<StackListResult>(token, '/api/stacks'),
      ]);

      setState({ loading: false, health, doctor, workspaces, stacks });
      setSelectedId((current) => currentProjectOrFirst(current, stacks.stacks));
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : 'Unable to load compose data.' });
    }
  }

  async function refreshRuntime(project: DiscoveredComposeProject | undefined = selectedProject) {
    if (project === undefined) {
      setRuntime({ loading: false });
      return;
    }

    setRuntime({ loading: true });

    try {
      const status = await apiGet<StackRuntimeStatus>(token, `/api/stacks/${encodeURIComponent(project.id)}/runtime`);
      setRuntime({ loading: false, status });
    } catch (error) {
      setRuntime({ loading: false, error: error instanceof Error ? error.message : 'Runtime unavailable.' });
    }
  }

  async function executeServiceCommand(command: string, serviceName: string) {
    if (selectedProject === undefined || serviceAction.busy) return;

    setServiceAction({ serviceName, command, busy: true });
    try {
      const request: CommandRequest = {
        command,
        composeFilePath: selectedProject.composeFilePath,
        services: [serviceName],
        options: {},
        confirmed: true,
        destructiveConfirmed: destructiveCommands.has(command),
      };
      const result = await apiPost<ComposeExecutionResult>(token, '/api/commands/execute', request);
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || `Command exited with code ${result.exitCode}.`);
      }
      setServiceAction({ serviceName, command, busy: false, message: `${command} completed.` });
      await refreshRuntime(selectedProject);
    } catch (error) {
      setServiceAction({ serviceName, command, busy: false, error: error instanceof Error ? error.message : 'Unable to execute service command.' });
    }
  }

  async function saveWorkspaceFromUi() {
    const name = workspaceForm.name.trim();
    const path = workspaceForm.path.trim();
    const editingName = workspaceForm.editingName;
    const alreadyExists = state.workspaces?.workspaces.some((workspace) => workspace.name === name) ?? false;

    if (name.length === 0 || path.length === 0) {
      setWorkspaceForm((current) => ({ ...current, error: 'Workspace name and path are required.', message: undefined }));
      return;
    }

    await runWorkspaceMutation(
      () => apiPost<WorkspaceListResult>(token, '/api/workspaces', { name, path }),
      editingName === undefined && !alreadyExists ? `Workspace ${name} was created.` : `Workspace ${name} was updated.`,
      true,
    );
  }

  function editWorkspaceFromUi(workspace: WorkspaceDefinition) {
    setWorkspaceRemovalName(undefined);
    setWorkspaceForm({
      name: workspace.name,
      path: workspace.path,
      busy: false,
      editingName: workspace.name,
      message: undefined,
      error: undefined,
    });
  }

  function cancelWorkspaceEdit() {
    setWorkspaceForm({ name: '', path: '', busy: false });
  }

  async function useWorkspaceFromUi(name: string) {
    await runWorkspaceMutation(
      () => apiPost<WorkspaceListResult>(token, '/api/workspaces/current', { name }),
      `Workspace ${name} is now current.`,
      false,
    );
  }

  async function removeWorkspaceFromUi(name: string) {
    setWorkspaceRemovalName(undefined);
    await runWorkspaceMutation(
      () => apiDelete<WorkspaceListResult>(token, `/api/workspaces/${encodeURIComponent(name)}`),
      `Workspace ${name} was removed.`,
      false,
    );
  }

  async function runWorkspaceMutation(
    mutation: () => Promise<WorkspaceListResult>,
    successMessage: string,
    clearForm: boolean,
  ) {
    setWorkspaceForm((current) => ({ ...current, busy: true, error: undefined, message: undefined }));

    try {
      const workspaces = await mutation();
      setState((current) => ({ ...current, workspaces }));
      setWorkspaceForm((current) => ({
        name: clearForm ? '' : current.name,
        path: clearForm ? '' : current.path,
        busy: false,
        ...(clearForm || current.editingName === undefined ? {} : { editingName: current.editingName }),
        message: successMessage,
      }));
      setWorkspaceRemovalName(undefined);
      setSelectedId(undefined);
      clearCommandFeedback(setForm);
      await load();
    } catch (error) {
      setWorkspaceForm((current) => ({
        ...current,
        busy: false,
        error: error instanceof Error ? error.message : 'Unable to update workspace configuration.',
      }));
    }
  }

  async function preview() {
    const request = createRequest(selectedProject, form);

    if (request === undefined) {
      return;
    }

    setForm((current) => ({
      ...current,
      busy: true,
      confirmed: false,
      destructiveConfirmed: false,
      error: undefined,
      preview: undefined,
      execution: undefined,
    }));

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

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    void refreshRuntime(selectedProject);
  }, [selectedProject, token]);

  useEffect(() => {
    if (activeView !== 'stacks' || selectedProject === undefined || refreshInterval === 0) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshRuntime(selectedProject);
    }, refreshInterval);
    return () => window.clearInterval(timer);
  }, [activeView, refreshInterval, selectedProject, token]);

  const destructive = destructiveCommands.has(form.command);
  const canExecute = form.preview !== undefined && form.confirmed && (!destructive || form.destructiveConfirmed);

  return (
    <div className="app-frame">
      <Sidebar activeView={activeView} setActiveView={setActiveView} summary={summary} />
      <main className="app-shell">
        <TopBar
          loading={state.loading || workspaceForm.busy}
          workspaceLabel={summary.workspaceLabel}
          health={state.health}
          onRefresh={() => void load()}
        />

        {state.error === undefined ? null : <Banner tone="danger">{state.error}</Banner>}

        {activeView === 'dashboard' ? (
          <DashboardView
            loading={state.loading}
            summary={summary}
            state={state}
            runtime={runtime}
            setActiveView={setActiveView}
            onRefresh={() => void load()}
          />
        ) : null}

        {activeView === 'workspaces' ? (
          <WorkspacesView
            workspaces={state.workspaces}
            form={workspaceForm}
            setForm={setWorkspaceForm}
            workspaceRemovalName={workspaceRemovalName}
            onSave={() => void saveWorkspaceFromUi()}
            onUse={(name) => void useWorkspaceFromUi(name)}
            onEdit={editWorkspaceFromUi}
            onCancelEdit={cancelWorkspaceEdit}
            onAskRemove={(name) => setWorkspaceRemovalName(name)}
            onCancelRemove={() => setWorkspaceRemovalName(undefined)}
            onRemove={(name) => void removeWorkspaceFromUi(name)}
            onOpenStacks={() => setActiveView('stacks')}
          />
        ) : null}

        {activeView === 'stacks' ? (
          <StacksView
            stacks={state.stacks}
            visibleProjects={visibleProjects}
            selectedProject={selectedProject}
            selectedId={selectedId}
            runtime={runtime}
            search={stackSearch}
            sort={stackSort}
            setSearch={setStackSearch}
            setSort={setStackSort}
            onSelect={(id) => {
              setSelectedId(id);
              setActiveView('stacks');
              clearCommandFeedback(setForm);
            }}
            onOpenCommands={() => setActiveView('commands')}
            serviceAction={serviceAction}
            refreshInterval={refreshInterval}
            onRefreshIntervalChange={setRefreshInterval}
            onExecuteServiceCommand={(command, serviceName) => void executeServiceCommand(command, serviceName)}
            onRefreshRuntime={() => void refreshRuntime()}
          />
        ) : null}

        {activeView === 'services' ? (
          <ServicesView
            token={token}
            project={selectedProject}
            onChooseStack={() => setActiveView('stacks')}
            onCommitted={load}
          />
        ) : null}

        {activeView === 'doctor' ? <DoctorView report={state.doctor} loading={state.loading} /> : null}

        {activeView === 'commands' ? (
          <CommandView
            project={selectedProject}
            form={form}
            setForm={setForm}
            destructive={destructive}
            canExecute={canExecute}
            preview={() => void preview()}
            execute={() => void execute()}
            onOpenStacks={() => setActiveView('stacks')}
          />
        ) : null}
      </main>
    </div>
  );
}

function Sidebar({
  activeView,
  setActiveView,
  summary,
}: {
  activeView: AppView;
  setActiveView: (view: AppView) => void;
  summary: DashboardSummary;
}) {
  return (
    <aside className="sidebar">
      <div className="brand-card">
        <span className="brand-mark">c</span>
        <div>
          <strong>compose</strong>
          <small>Local control center</small>
        </div>
      </div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        <NavButton active={activeView === 'dashboard'} label="Dashboard" description="Overview" onClick={() => setActiveView('dashboard')} />
        <NavButton active={activeView === 'workspaces'} label="Workspaces" description={`${summary.workspaceCount} saved`} onClick={() => setActiveView('workspaces')} />
        <NavButton active={activeView === 'stacks'} label="Stacks" description={`${summary.stackCount} projects`} onClick={() => setActiveView('stacks')} />
        <NavButton active={activeView === 'services'} label="Services" description="Guided YAML editor" onClick={() => setActiveView('services')} />
        <NavButton active={activeView === 'doctor'} label="Doctor" description={summary.doctorIssues === 0 ? 'Healthy' : `${summary.doctorIssues} issues`} onClick={() => setActiveView('doctor')} />
        <NavButton active={activeView === 'commands'} label="Commands" description="Preview first" onClick={() => setActiveView('commands')} />
      </nav>
      <div className="sidebar-footer">
        <small>Workspace</small>
        <strong>{summary.workspaceLabel}</strong>
        <span>{summary.selectedStackLabel}</span>
      </div>
    </aside>
  );
}

function NavButton({ active, label, description, onClick }: { active: boolean; label: string; description: string; onClick: () => void }) {
  return (
    <button className={active ? 'nav-button active' : 'nav-button'} type="button" onClick={onClick}>
      <span>{label}</span>
      <small>{description}</small>
    </button>
  );
}

function TopBar({
  loading,
  workspaceLabel,
  health,
  onRefresh,
}: {
  loading: boolean;
  workspaceLabel: string;
  health?: { ok: boolean; host: string };
  onRefresh: () => void;
}) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">CLI-first · local-only · token-protected</p>
        <h1>Docker Compose workspace</h1>
      </div>
      <div className="topbar-actions">
        <StatusPill tone={health?.ok === false ? 'danger' : 'ok'}>{health === undefined ? 'Server pending' : `Local ${health.host}`}</StatusPill>
        <StatusPill tone="warning">{workspaceLabel}</StatusPill>
        <button className="secondary" type="button" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </header>
  );
}

function DashboardView({
  loading,
  summary,
  state,
  runtime,
  setActiveView,
  onRefresh,
}: {
  loading: boolean;
  summary: DashboardSummary;
  state: LoadState;
  runtime: RuntimeState;
  setActiveView: (view: AppView) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="view-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Professional local UI</p>
          <h2>Operate your Compose stacks with confidence.</h2>
          <p className="muted">
            Manage workspaces, inspect diagnostics, browse stacks, preview Docker Compose commands and execute only after explicit confirmation.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" onClick={() => setActiveView('workspaces')}>Manage workspaces</button>
          <button className="secondary" type="button" onClick={() => setActiveView('stacks')}>Browse stacks</button>
          <button className="secondary" type="button" onClick={() => setActiveView('commands')}>Prepare command</button>
        </div>
      </section>

      {loading ? <SkeletonGrid /> : null}

      <section className="metric-grid" aria-label="Workspace summary">
        <MetricCard label="Workspaces" value={summary.workspaceCount.toString()} detail={summary.workspaceLabel} tone="info" />
        <MetricCard label="Stacks" value={summary.stackCount.toString()} detail={state.stacks?.root ?? 'Waiting for scan'} tone="info" />
        <MetricCard label="Services" value={summary.serviceCount.toString()} detail="Declared across detected stacks" tone="ok" />
        <MetricCard label="Doctor" value={summary.doctorIssues === 0 ? 'OK' : summary.doctorIssues.toString()} detail={summary.doctorIssues === 0 ? 'No issue detected' : 'Warnings or errors found'} tone={summary.doctorIssues === 0 ? 'ok' : 'warning'} />
        <MetricCard label="Runtime" value={summary.runtimeLabel} detail={summary.selectedStackLabel} tone={runtime.error === undefined ? 'info' : 'warning'} />
      </section>

      <section className="grid two-columns">
        <Panel title="Current workspace" subtitle="Local configuration">
          <WorkspacePanel workspaces={state.workspaces} health={state.health} onManage={() => setActiveView('workspaces')} />
        </Panel>
        <Panel title="Recommended workflow" subtitle="Safe by default">
          <div className="timeline">
            <Step number="1" title="Choose a workspace" detail="Create or select the source root you want to operate from." />
            <Step number="2" title="Select a stack" detail="Search and inspect services before choosing an action." />
            <Step number="3" title="Preview command" detail="The generated docker compose command is shown before execution." />
            <Step number="4" title="Confirm execution" detail="Dangerous actions require a second explicit confirmation." />
          </div>
          <div className="actions compact-actions">
            <button type="button" onClick={() => setActiveView('workspaces')}>Manage workspaces</button>
            <button className="secondary" type="button" onClick={() => setActiveView('stacks')}>Open stacks</button>
            <button className="secondary" type="button" onClick={onRefresh}>Refresh data</button>
          </div>
        </Panel>
      </section>
    </div>
  );
}

function WorkspacesView({
  workspaces,
  form,
  setForm,
  workspaceRemovalName,
  onSave,
  onUse,
  onEdit,
  onCancelEdit,
  onAskRemove,
  onCancelRemove,
  onRemove,
  onOpenStacks,
}: {
  workspaces?: WorkspaceListResult;
  form: WorkspaceFormState;
  setForm: React.Dispatch<React.SetStateAction<WorkspaceFormState>>;
  workspaceRemovalName?: string;
  onSave: () => void;
  onUse: (name: string) => void;
  onEdit: (workspace: WorkspaceDefinition) => void;
  onCancelEdit: () => void;
  onAskRemove: (name: string) => void;
  onCancelRemove: () => void;
  onRemove: (name: string) => void;
  onOpenStacks: () => void;
}) {
  const entries = workspaces?.workspaces ?? [];
  const currentWorkspaceName = workspaces?.currentWorkspaceName;
  const editing = form.editingName !== undefined;

  return (
    <div className="view-stack">
      <section className="hero-panel compact-hero">
        <div>
          <p className="eyebrow">Workspace management</p>
          <h2>Configure source roots from the browser.</h2>
          <p className="muted">Create, edit, select and remove local workspaces without returning to the terminal.</p>
        </div>
        <button className="secondary" type="button" onClick={onOpenStacks}>Open stacks</button>
      </section>

      <section className="grid two-columns workspace-management-grid">
        <Panel title={editing ? `Edit ${form.editingName}` : 'Add workspace'} subtitle="Stored in the local user config">
          <div className="workspace-form polished-workspace-form">
            <div className="workspace-form-header">
              <StatusPill tone={editing ? 'warning' : 'ok'}>{editing ? 'Editing existing workspace' : 'New workspace'}</StatusPill>
              <small>{editing ? 'Update the source path, then save.' : 'Choose a short name and a local source root.'}</small>
            </div>
            <label>
              Name
              <input
                placeholder="dev"
                value={form.name}
                disabled={form.busy || editing}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value, error: undefined, message: undefined }))}
              />
            </label>
            <label>
              Path
              <input
                placeholder="C:\\Sources or /home/me/sources"
                value={form.path}
                disabled={form.busy}
                onChange={(event) => setForm((current) => ({ ...current, path: event.target.value, error: undefined, message: undefined }))}
              />
            </label>
            <p className="workspace-form-hint">Saving an existing workspace name updates its path. Remove stays behind a confirmation step.</p>
            <div className="actions workspace-form-actions">
              <button type="button" onClick={onSave} disabled={form.busy}>{form.busy ? 'Saving...' : editing ? 'Update workspace' : 'Create workspace'}</button>
              {editing ? <button className="secondary" type="button" onClick={onCancelEdit} disabled={form.busy}>Cancel edit</button> : null}
            </div>
            {form.error === undefined ? null : <Banner tone="danger">{form.error}</Banner>}
            {form.message === undefined ? null : <Banner tone="info">{form.message}</Banner>}
          </div>
        </Panel>

        <Panel title="Saved workspaces" subtitle={currentWorkspaceName === undefined ? 'No current workspace' : `Current: ${currentWorkspaceName}`}>
          <div className="workspace-list polished-workspace-list">
            {entries.length === 0 ? (
              <EmptyState title="No workspace saved yet" detail="Create a workspace to make scan and stack operations start from a known root." />
            ) : (
              entries.map((workspace) => (
                <WorkspaceCard
                  key={workspace.name}
                  workspace={workspace}
                  current={workspace.name === currentWorkspaceName}
                  busy={form.busy}
                  removalRequested={workspaceRemovalName === workspace.name}
                  onUse={() => onUse(workspace.name)}
                  onEdit={() => onEdit(workspace)}
                  onAskRemove={() => onAskRemove(workspace.name)}
                  onCancelRemove={onCancelRemove}
                  onRemove={() => onRemove(workspace.name)}
                />
              ))
            )}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function WorkspaceCard({
  workspace,
  current,
  busy,
  removalRequested,
  onUse,
  onEdit,
  onAskRemove,
  onCancelRemove,
  onRemove,
}: {
  workspace: WorkspaceDefinition;
  current: boolean;
  busy: boolean;
  removalRequested: boolean;
  onUse: () => void;
  onEdit: () => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
}) {
  return (
    <article className={current ? 'workspace-card current polished-workspace-card' : 'workspace-card polished-workspace-card'}>
      <div className="workspace-card-main">
        <div className="workspace-title-row">
          <strong>{workspace.name}</strong>
          {current ? <StatusPill tone="ok">Current</StatusPill> : <StatusPill tone="warning">Saved</StatusPill>}
        </div>
        <PathDisplay path={workspace.path} />
        <small>Updated {formatOptionalDate(workspace.updatedAt)}</small>
      </div>
      <div className="workspace-card-actions">
        {current ? <span className="current-label">Active workspace</span> : <button className="secondary" type="button" onClick={onUse} disabled={busy}>Use</button>}
        <button className="secondary" type="button" onClick={onEdit} disabled={busy}>Edit</button>
        {removalRequested ? (
          <div className="workspace-remove-confirmation">
            <span>Remove this workspace?</span>
            <button className="danger compact-button" type="button" onClick={onRemove} disabled={busy}>Confirm</button>
            <button className="ghost compact-button" type="button" onClick={onCancelRemove} disabled={busy}>Cancel</button>
          </div>
        ) : (
          <button className="ghost danger-link" type="button" onClick={onAskRemove} disabled={busy}>Remove</button>
        )}
      </div>
    </article>
  );
}

function StacksView({
  stacks,
  visibleProjects,
  selectedProject,
  selectedId,
  runtime,
  search,
  sort,
  setSearch,
  setSort,
  onSelect,
  onOpenCommands,
  serviceAction,
  refreshInterval,
  onRefreshIntervalChange,
  onExecuteServiceCommand,
  onRefreshRuntime,
}: {
  stacks?: StackListResult;
  visibleProjects: DiscoveredComposeProject[];
  selectedProject?: DiscoveredComposeProject;
  selectedId?: string;
  runtime: RuntimeState;
  search: string;
  sort: StackSortMode;
  setSearch: (value: string) => void;
  setSort: (value: StackSortMode) => void;
  onSelect: (id: string) => void;
  onOpenCommands: () => void;
  serviceAction: ServiceActionState;
  refreshInterval: RefreshInterval;
  onRefreshIntervalChange: (value: RefreshInterval) => void;
  onExecuteServiceCommand: (command: string, serviceName: string) => void;
  onRefreshRuntime: () => void;
}) {
  return (
    <div className="view-stack">
      <Panel title="Stacks" subtitle={stacks === undefined ? 'Compose projects' : `${stacks.stacks.length} detected · ${stacks.root}`}>
        <div className="toolbar">
          <label>
            Search
            <input
              type="search"
              placeholder="Name, path or service..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value as StackSortMode)}>
              <option value="name">Name</option>
              <option value="path">Path</option>
              <option value="services">Service count</option>
              <option value="runtime">Selected runtime first</option>
            </select>
          </label>
        </div>

        <div className="stack-layout">
          <div className="stack-list scroll-panel">
            {visibleProjects.length === 0 ? (
              <EmptyState title="No Compose stack found" detail="Change the search, configure a workspace, or scan a narrower root." />
            ) : (
              visibleProjects.map((project) => (
                <StackCard
                  key={project.id}
                  project={project}
                  selected={project.id === selectedId}
                  runtime={project.id === selectedId ? runtime : undefined}
                  onSelect={() => onSelect(project.id)}
                />
              ))
            )}
          </div>
          <StackDetailPanel project={selectedProject} runtime={runtime} serviceAction={serviceAction} refreshInterval={refreshInterval} onRefreshIntervalChange={onRefreshIntervalChange} onExecuteServiceCommand={onExecuteServiceCommand} onOpenCommands={onOpenCommands} onRefreshRuntime={onRefreshRuntime} />
        </div>
      </Panel>
    </div>
  );
}

function DoctorView({ report, loading }: { report?: DoctorReport; loading: boolean }) {
  const checks = report?.checks ?? [];
  const okChecks = checks.filter((check) => check.status === 'ok').length;
  const warningChecks = checks.filter((check) => check.status === 'warning').length;
  const errorChecks = checks.filter((check) => check.status === 'error').length;

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <MetricCard label="Status" value={report?.ok === true ? 'OK' : loading ? 'Loading' : 'Review'} detail="Local installation diagnostics" tone={report?.ok === true ? 'ok' : 'warning'} />
        <MetricCard label="OK" value={okChecks.toString()} detail="Successful checks" tone="ok" />
        <MetricCard label="Warnings" value={warningChecks.toString()} detail="Non-blocking issues" tone="warning" />
        <MetricCard label="Errors" value={errorChecks.toString()} detail="Action required" tone={errorChecks === 0 ? 'ok' : 'danger'} />
      </section>
      <Panel title="Doctor diagnostics" subtitle="Node, npm, Docker, PATH and workspace checks">
        {report === undefined ? (
          <EmptyState title="No diagnostic report loaded" detail="Refresh the dashboard to load local diagnostics." />
        ) : (
          <div className="check-list">
            {checks.length === 0 ? (
              <EmptyState title="No checks returned" detail="The doctor service did not return any diagnostic entry." />
            ) : (
              checks.map((check) => (
                <article key={check.id} className={`check-row ${check.status}`}>
                  <div>
                    <strong>{check.name}</strong>
                    <span>{check.message}</span>
                  </div>
                  <StatusPill tone={check.status === 'error' ? 'danger' : check.status}>{check.status}</StatusPill>
                  {check.details === undefined ? null : <small>{check.details}</small>}
                </article>
              ))
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

function CommandView({
  project,
  form,
  setForm,
  destructive,
  canExecute,
  preview,
  execute,
  onOpenStacks,
}: {
  project?: DiscoveredComposeProject;
  form: CommandFormState;
  setForm: React.Dispatch<React.SetStateAction<CommandFormState>>;
  destructive: boolean;
  canExecute: boolean;
  preview: () => void;
  execute: () => void;
  onOpenStacks: () => void;
}) {
  const services = project?.services ?? [];

  return (
    <div className="view-stack">
      <Panel title="Command workflow" subtitle="Preview first, confirm second, execute last">
        {project === undefined ? (
          <div className="empty-action">
            <EmptyState title="Select a stack before preparing a command" detail="The command builder needs a Compose file target." />
            <button type="button" onClick={onOpenStacks}>Choose a stack</button>
          </div>
        ) : (
          <div className="selected-command-target">
            <div>
              <span className="muted">Selected stack</span>
              <strong>{project.name}</strong>
              <small>{project.composeFilePath}</small>
            </div>
            <StatusPill tone="ok">{project.services.length} services</StatusPill>
          </div>
        )}

        <div className="command-grid">
          <label>
            Command
            <select
              value={form.command}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  command: event.target.value,
                  confirmed: false,
                  destructiveConfirmed: false,
                  preview: undefined,
                  execution: undefined,
                  error: undefined,
                }))
              }
            >
              {commands.map((command) => (
                <option key={command} value={command}>{command}</option>
              ))}
            </select>
          </label>
          <label>
            Service scope
            <select
              value={form.serviceName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  serviceName: event.target.value,
                  confirmed: false,
                  destructiveConfirmed: false,
                  preview: undefined,
                  execution: undefined,
                  error: undefined,
                }))
              }
            >
              <option value="">All services / stack level</option>
              {services.map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </label>
        </div>

        {destructive ? (
          <Banner tone="warning">
            This command is destructive. Review the generated command and confirm the danger-zone checkbox before execution.
          </Banner>
        ) : null}

        <div className="command-steps">
          <Step number="1" title="Preview" detail="Generate and inspect the Docker Compose command." />
          <Step number="2" title="Confirm" detail="Explicitly approve execution after preview." />
          <Step number="3" title="Execute" detail="Run only when all safety checks are satisfied." />
        </div>

        <div className="actions">
          <button type="button" onClick={preview} disabled={project === undefined || form.busy}>Preview command</button>
          <button className={destructive ? 'danger' : undefined} type="button" onClick={execute} disabled={!canExecute || form.busy}>
            {form.busy ? 'Working...' : 'Execute command'}
          </button>
        </div>

        <div className={destructive ? 'confirmation-zone danger-zone' : 'confirmation-zone'}>
          <label>
            <input
              type="checkbox"
              checked={form.confirmed}
              disabled={form.preview === undefined}
              onChange={(event) => setForm((current) => ({ ...current, confirmed: event.target.checked }))}
            />
            I reviewed the generated command and confirm execution.
          </label>
          {destructive ? (
            <label>
              <input
                type="checkbox"
                checked={form.destructiveConfirmed}
                disabled={form.preview === undefined}
                onChange={(event) => setForm((current) => ({ ...current, destructiveConfirmed: event.target.checked }))}
              />
              I understand this destructive command can stop or remove resources.
            </label>
          ) : null}
        </div>

        {form.error === undefined ? null : <Banner tone="danger">{form.error}</Banner>}
        {form.preview === undefined ? null : <CodeBlock title="Generated command" content={form.preview.displayCommand} />}
        {form.execution === undefined ? null : <CodeBlock title={`Execution result · exit ${form.execution.exitCode}`} content={formatExecution(form.execution)} />}
      </Panel>
    </div>
  );
}

function WorkspacePanel({ workspaces, health, onManage }: { workspaces?: WorkspaceListResult; health?: { host: string }; onManage: () => void }) {
  const entries = workspaces?.workspaces ?? [];

  return (
    <div className="workspace-panel-content">
      {workspaces?.currentWorkspaceName === undefined ? (
        <Banner tone="warning">No current workspace configured.</Banner>
      ) : (
        <StatusPill tone="ok">Current: {workspaces.currentWorkspaceName}</StatusPill>
      )}
      <div className="list">
        {entries.length === 0 ? (
          <EmptyState title="No workspace saved yet" detail="Create a workspace from the UI to make compose open directly on your usual source root." />
        ) : (
          entries.map((workspace) => (
            <article key={workspace.name} className="list-item">
              <strong>{workspace.name}</strong>
              <PathDisplay path={workspace.path} />
            </article>
          ))
        )}
      </div>
      <div className="actions compact-actions">
        <button className="secondary" type="button" onClick={onManage}>Manage workspaces</button>
        {health === undefined ? null : <small className="muted">Server: {health.host}</small>}
      </div>
    </div>
  );
}

function StackCard({
  project,
  selected,
  runtime,
  onSelect,
}: {
  project: DiscoveredComposeProject;
  selected: boolean;
  runtime?: RuntimeState;
  onSelect: () => void;
}) {
  const runtimeTone = runtimeToneFromState(runtime);
  const runtimeLabel = selected && runtime?.status !== undefined ? runtime.status.state : selected && runtime?.loading === true ? 'loading' : 'not loaded';

  return (
    <button type="button" className={selected ? 'stack-card selected' : 'stack-card'} onClick={onSelect}>
      <div className="stack-card-main">
        <strong>{project.name}</strong>
        <span>{project.relativePath}</span>
      </div>
      <div className="stack-card-meta">
        <StatusPill tone={runtimeTone}>{runtimeLabel}</StatusPill>
        <small>{project.services.length} services</small>
      </div>
    </button>
  );
}

function StackDetailPanel({
  project,
  runtime,
  serviceAction,
  refreshInterval,
  onRefreshIntervalChange,
  onExecuteServiceCommand,
  onOpenCommands,
  onRefreshRuntime,
}: {
  project?: DiscoveredComposeProject;
  runtime: RuntimeState;
  serviceAction: ServiceActionState;
  refreshInterval: RefreshInterval;
  onRefreshIntervalChange: (value: RefreshInterval) => void;
  onExecuteServiceCommand: (command: string, serviceName: string) => void;
  onOpenCommands: () => void;
  onRefreshRuntime: () => void;
}) {
  const services = project?.services ?? [];
  const status = runtime.status;

  return (
    <section className="stack-detail-panel">
      {project === undefined ? (
        <EmptyState title="No stack selected" detail="Choose a stack from the list to inspect services, runtime and command options." />
      ) : (
        <>
          <div className="detail-header">
            <div>
              <p className="eyebrow">Selected stack</p>
              <h2>{project.name}</h2>
              <span className="muted path-text">{project.composeFilePath}</span>
            </div>
            <div className="detail-actions runtime-refresh-controls">
              <button className="secondary" type="button" onClick={onRefreshRuntime} disabled={runtime.loading}>Refresh</button>
              <label className="refresh-interval-control">
                <span>Auto refresh</span>
                <select value={refreshInterval} onChange={(event) => onRefreshIntervalChange(Number(event.target.value) as RefreshInterval)}>
                  <option value={0}>Manual</option>
                  <option value={5000}>5 sec</option>
                  <option value={10000}>10 sec</option>
                  <option value={30000}>30 sec</option>
                  <option value={60000}>1 min</option>
                </select>
              </label>
              <button type="button" onClick={onOpenCommands}>Prepare command</button>
            </div>
          </div>

          <div className="status-line">
            <StatusPill tone={runtimeToneFromState(runtime)}>
              {runtime.loading ? 'Loading runtime...' : status?.summary ?? 'Runtime unknown'}
            </StatusPill>
            {runtime.error === undefined ? null : <span className="danger-text">{runtime.error}</span>}
          </div>
          {status?.warning === undefined ? null : <Banner tone="warning">{status.warning}</Banner>}

          <div className="service-grid">
            {services.length === 0 ? (
              <EmptyState title="No service declared" detail="This Compose file was detected, but no services were parsed." />
            ) : (
              services.map((service) => {
                const serviceStatus = status?.services?.[service];
                const containerCount = serviceStatus?.containerCount ?? 0;
                const ports = serviceStatus?.ports ?? [];

                return (
                  <article key={service} className="service-card professional-service-card">
                    <div className="service-card-header">
                      <div className="service-title-row">
                        <strong className="service-name" title={service}>{service}</strong>
                        <StatusPill tone={toneForServiceState(serviceStatus?.state)}>{serviceStatus?.state ?? 'unknown'}</StatusPill>
                      </div>
                      <ServiceActionGroup serviceName={service} state={serviceStatus?.state} action={serviceAction} onExecute={onExecuteServiceCommand} onOpenCommands={onOpenCommands} />
                    </div>
                    {containerCount > 0 ? (
                      <div className="service-runtime-meta">
                        <span>{containerCount} {containerCount === 1 ? 'container' : 'containers'}</span>
                        {serviceStatus?.containerNames === undefined || serviceStatus.containerNames.length === 0 ? null : <small title={serviceStatus.containerNames.join(', ')}>Containers: {serviceStatus.containerNames.join(', ')}</small>}
                      </div>
                    ) : null}
                    {ports.length > 0 ? <ServicePortLinks ports={ports} /> : null}
                    {serviceAction.serviceName === service && serviceAction.message !== undefined ? <small className="service-action-feedback success">{serviceAction.message}</small> : null}
                    {serviceAction.serviceName === service && serviceAction.error !== undefined ? <small className="service-action-feedback error">{serviceAction.error}</small> : null}
                  </article>
                );
              })
            )}
          </div>
        </>
      )}
    </section>
  );
}

function ServicePortLinks({ ports }: { ports: string[] }) {
  const links = ports.map((port) => ({ port, link: createPublishedPortLink(port) })).filter((entry) => entry.link !== undefined);
  if (links.length === 0) return null;
  return <div className="service-port-list" aria-label="Published service ports"><small>Published ports</small><div>{links.map(({ port, link }) => link === undefined ? null : <a key={port} className="service-port-link" href={link.href} target="_blank" rel="noreferrer" title={link.title}><span>{link.label}</span><span aria-hidden="true">↗</span></a>)}</div></div>;
}

function ServiceActionGroup({ serviceName, state, action, onExecute, onOpenCommands }: { serviceName: string; state?: string; action: ServiceActionState; onExecute: (command: string, serviceName: string) => void; onOpenCommands: () => void }) {
  const running = state?.toLowerCase().includes('running') === true;
  const busy = action.busy && action.serviceName === serviceName;
  return <div className="service-action-group" role="group" aria-label={`Actions for ${serviceName}`}>
    <ServiceActionButton label="Start" icon="▶" disabled={running || busy} onClick={() => onExecute('start', serviceName)} />
    <ServiceActionButton label="Restart" icon="↻" disabled={!running || busy} onClick={() => onExecute('restart', serviceName)} />
    <ServiceActionButton label="Stop" icon="■" disabled={!running || busy} onClick={() => onExecute('stop', serviceName)} />
    <ServiceActionButton label="Logs" icon="≡" disabled={busy} onClick={() => onExecute('logs', serviceName)} />
    <ServiceActionButton label="More commands" icon="⋮" disabled={busy} onClick={onOpenCommands} />
  </div>;
}

function ServiceActionButton({ label, icon, disabled = false, onClick }: { label: string; icon: string; disabled?: boolean; onClick: () => void }) {
  return <button className="service-action-button" type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}><span aria-hidden="true">{icon}</span></button>;
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'ok' | 'warning' | 'danger' | 'info' }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <span>{subtitle}</span>
        </div>
      </div>
      {children}
    </section>
  );
}

function Step({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <article className="step-card">
      <span>{number}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <section className="metric-grid" aria-label="Loading summary">
      <div className="skeleton-card" />
      <div className="skeleton-card" />
      <div className="skeleton-card" />
      <div className="skeleton-card" />
    </section>
  );
}

function Banner({ tone, children }: { tone: 'info' | 'warning' | 'danger'; children: React.ReactNode }) {
  return <div className={`banner ${tone}`}>{children}</div>;
}

function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

function CodeBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="code-block">
      <strong>{title}</strong>
      <pre>{content}</pre>
    </div>
  );
}

function PathDisplay({ path }: { path: string }) {
  return <code className="path-code" title={path}>{path}</code>;
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

function createDashboardSummary(
  state: LoadState,
  selectedProject: DiscoveredComposeProject | undefined,
  runtime: RuntimeState,
): DashboardSummary {
  const stacks = state.stacks?.stacks ?? [];
  const doctorIssues = state.doctor?.checks.filter((check) => check.status !== 'ok').length ?? 0;

  return {
    stackCount: stacks.length,
    serviceCount: stacks.reduce((total, project) => total + project.services.length, 0),
    workspaceLabel: state.workspaces?.currentWorkspaceName ?? state.stacks?.workspaceName ?? 'No workspace',
    workspaceCount: state.workspaces?.workspaces.length ?? 0,
    doctorIssues,
    runtimeLabel: runtime.loading ? 'Loading' : runtime.status?.state ?? (runtime.error === undefined ? 'Unknown' : 'Unavailable'),
    selectedStackLabel: selectedProject?.name ?? 'No stack selected',
  };
}

function filterProjects(projects: DiscoveredComposeProject[], search: string): DiscoveredComposeProject[] {
  const query = search.trim().toLowerCase();

  if (query.length === 0) {
    return projects;
  }

  return projects.filter((project) => [
    project.name,
    project.relativePath,
    project.composeFilePath,
    project.services.join(' '),
  ].some((value) => value.toLowerCase().includes(query)));
}

function sortProjects(projects: DiscoveredComposeProject[], sortMode: StackSortMode, selectedProjectId: string | undefined): DiscoveredComposeProject[] {
  return [...projects].sort((left, right) => {
    if (sortMode === 'services') {
      return right.services.length - left.services.length || left.name.localeCompare(right.name);
    }

    if (sortMode === 'path') {
      return left.relativePath.localeCompare(right.relativePath) || left.name.localeCompare(right.name);
    }

    if (sortMode === 'runtime') {
      return Number(right.id === selectedProjectId) - Number(left.id === selectedProjectId) || left.name.localeCompare(right.name);
    }

    return left.name.localeCompare(right.name) || left.relativePath.localeCompare(right.relativePath);
  });
}

function currentProjectOrFirst(current: string | undefined, projects: DiscoveredComposeProject[]): string | undefined {
  if (current !== undefined && projects.some((project) => project.id === current)) {
    return current;
  }

  return projects[0]?.id;
}

function clearCommandFeedback(setForm: React.Dispatch<React.SetStateAction<CommandFormState>>) {
  setForm((current) => ({
    ...current,
    serviceName: '',
    confirmed: false,
    destructiveConfirmed: false,
    preview: undefined,
    execution: undefined,
    error: undefined,
  }));
}

function runtimeToneFromState(runtime: RuntimeState | undefined): Tone {
  if (runtime === undefined || runtime.loading) {
    return 'warning';
  }

  if (runtime.error !== undefined || runtime.status?.available === false) {
    return 'warning';
  }

  return toneForServiceState(runtime.status?.state);
}

function toneForServiceState(state: string | undefined): Tone {
  if (state === undefined) {
    return 'warning';
  }

  const normalized = state.toLowerCase();

  if (normalized.includes('running') || normalized === 'ok') {
    return 'ok';
  }

  if (normalized.includes('unhealthy') || normalized.includes('error') || normalized.includes('failed')) {
    return 'danger';
  }

  return 'warning';
}

function formatExecution(execution: ComposeExecutionResult): string {
  return [
    `command: ${execution.command}`,
    `exitCode: ${execution.exitCode}`,
    execution.stdout === '' ? undefined : `stdout:\n${execution.stdout}`,
    execution.stderr === '' ? undefined : `stderr:\n${execution.stderr}`,
  ].filter((line): line is string => line !== undefined).join('\n\n');
}

function formatOptionalDate(value: string | undefined): string {
  if (value === undefined) {
    return 'recently';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'recently';
  }

  return date.toLocaleDateString();
}
