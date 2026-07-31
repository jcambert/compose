from pathlib import Path

app_path = Path('src/ui/App.tsx')
app = app_path.read_text(encoding='utf-8')

app = app.replace(
"type ServiceActionState = { serviceName?: string; command?: string; busy: boolean; message?: string; error?: string };",
"type ServiceActionState = { serviceName?: string; command?: string; busy: boolean; message?: string; error?: string };\ntype StackActionState = { projectId?: string; command?: string; busy: boolean; message?: string; error?: string };",
1,
)
app = app.replace(
"  const [serviceAction, setServiceAction] = useState<ServiceActionState>({ busy: false });",
"  const [serviceAction, setServiceAction] = useState<ServiceActionState>({ busy: false });\n  const [stackAction, setStackAction] = useState<StackActionState>({ busy: false });",
1,
)
anchor = "  async function saveWorkspaceFromUi() {"
stack_executor = """  async function executeStackCommand(project: DiscoveredComposeProject, command: string) {
    if (stackAction.busy) return;

    setStackAction({ projectId: project.id, command, busy: true });
    try {
      const request: CommandRequest = {
        command,
        composeFilePath: project.composeFilePath,
        services: [],
        options: {},
        confirmed: true,
        destructiveConfirmed: destructiveCommands.has(command),
      };
      const result = await apiPost<ComposeExecutionResult>(token, '/api/commands/execute', request);
      if (result.exitCode !== 0) throw new Error(result.stderr || `Command exited with code ${result.exitCode}.`);
      setStackAction({ projectId: project.id, command, busy: false, message: `${command} completed.` });
      if (selectedProject?.id === project.id) await refreshRuntime(project);
    } catch (error) {
      setStackAction({ projectId: project.id, command, busy: false, error: error instanceof Error ? error.message : 'Unable to execute stack command.' });
    }
  }

"""
if anchor not in app: raise SystemExit('save workspace anchor not found')
app = app.replace(anchor, stack_executor + anchor, 1)

old_props = """            serviceAction={serviceAction}
            refreshInterval={refreshInterval}
            onRefreshIntervalChange={setRefreshInterval}
            onExecuteServiceCommand={(command, serviceName) => void executeServiceCommand(command, serviceName)}
            onRefreshRuntime={() => void refreshRuntime()}
"""
new_props = """            serviceAction={serviceAction}
            stackAction={stackAction}
            refreshInterval={refreshInterval}
            onRefreshIntervalChange={setRefreshInterval}
            onExecuteServiceCommand={(command, serviceName) => void executeServiceCommand(command, serviceName)}
            onExecuteStackCommand={(project, command) => void executeStackCommand(project, command)}
            onRefreshRuntime={() => void refreshRuntime()}
"""
if old_props not in app: raise SystemExit('StacksView call marker not found')
app = app.replace(old_props, new_props, 1)

app = app.replace("  serviceAction,\n  refreshInterval,", "  serviceAction,\n  stackAction,\n  refreshInterval,", 1)
app = app.replace("  serviceAction: ServiceActionState;\n  refreshInterval: RefreshInterval;", "  serviceAction: ServiceActionState;\n  stackAction: StackActionState;\n  refreshInterval: RefreshInterval;", 1)
app = app.replace("  onExecuteServiceCommand: (command: string, serviceName: string) => void;\n  onRefreshRuntime: () => void;", "  onExecuteServiceCommand: (command: string, serviceName: string) => void;\n  onExecuteStackCommand: (project: DiscoveredComposeProject, command: string) => void;\n  onRefreshRuntime: () => void;", 1)
app = app.replace("  onExecuteServiceCommand,\n  onRefreshRuntime,", "  onExecuteServiceCommand,\n  onExecuteStackCommand,\n  onRefreshRuntime,", 1)

old_card_call = """                <StackCard
                  key={project.id}
                  project={project}
                  selected={project.id === selectedId}
                  runtime={project.id === selectedId ? runtime : undefined}
                  onSelect={() => onSelect(project.id)}
                />
"""
new_card_call = """                <StackCard
                  key={project.id}
                  project={project}
                  selected={project.id === selectedId}
                  runtime={project.id === selectedId ? runtime : undefined}
                  action={stackAction}
                  onSelect={() => onSelect(project.id)}
                  onExecute={(command) => onExecuteStackCommand(project, command)}
                  onOpenCommands={() => { onSelect(project.id); onOpenCommands(); }}
                />
"""
if old_card_call not in app: raise SystemExit('StackCard call marker not found')
app = app.replace(old_card_call, new_card_call, 1)

start = app.index('function StackCard({')
end = app.index('\nfunction StackDetailPanel({', start)
new_stack_card = """function StackCard({
  project,
  selected,
  runtime,
  action,
  onSelect,
  onExecute,
  onOpenCommands,
}: {
  project: DiscoveredComposeProject;
  selected: boolean;
  runtime?: RuntimeState;
  action: StackActionState;
  onSelect: () => void;
  onExecute: (command: string) => void;
  onOpenCommands: () => void;
}) {
  const runtimeTone = runtimeToneFromState(runtime);
  const runtimeLabel = selected && runtime?.status !== undefined ? runtime.status.state : selected && runtime?.loading === true ? 'loading' : 'not loaded';
  const running = runtime?.status?.runningServices !== undefined && runtime.status.runningServices > 0;

  return (
    <article className={selected ? 'stack-card selected' : 'stack-card'}>
      <button type="button" className="stack-card-select" onClick={onSelect} aria-label={`Select stack ${project.name}`}>
        <div className="stack-card-main">
          <strong>{project.name}</strong>
          <span>{project.relativePath}</span>
        </div>
        <div className="stack-card-meta">
          <StatusPill tone={runtimeTone}>{runtimeLabel}</StatusPill>
          <small>{project.services.length} services</small>
        </div>
      </button>
      <StackActionGroup projectName={project.name} running={running} known={runtime?.status !== undefined} action={action} projectId={project.id} onExecute={onExecute} onOpenCommands={onOpenCommands} />
      {action.projectId === project.id && action.message !== undefined ? <small className="stack-action-feedback success">{action.message}</small> : null}
      {action.projectId === project.id && action.error !== undefined ? <small className="stack-action-feedback error">{action.error}</small> : null}
    </article>
  );
}
"""
app = app[:start] + new_stack_card + app[end:]

old_refresh = """            <div className="detail-actions runtime-refresh-controls">
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
"""
new_refresh = """            <div className="detail-actions runtime-refresh-controls">
              <div className="compact-refresh-control" role="group" aria-label="Runtime refresh controls">
                <button className="secondary refresh-icon-button" type="button" onClick={onRefreshRuntime} disabled={runtime.loading} title="Refresh runtime now" aria-label="Refresh runtime now">↻</button>
                <select aria-label="Auto refresh interval" title="Auto refresh interval" value={refreshInterval} onChange={(event) => onRefreshIntervalChange(Number(event.target.value) as RefreshInterval)}>
                  <option value={0}>Manual</option>
                  <option value={5000}>5 sec</option>
                  <option value={10000}>10 sec</option>
                  <option value={30000}>30 sec</option>
                  <option value={60000}>1 min</option>
                </select>
              </div>
              <button type="button" onClick={onOpenCommands}>Prepare command</button>
            </div>
"""
if old_refresh not in app: raise SystemExit('refresh controls marker not found')
app = app.replace(old_refresh, new_refresh, 1)

anchor = 'function ServiceActionGroup({ serviceName, state, action, onExecute, onOpenCommands }'
stack_group = """function StackActionGroup({ projectName, projectId, running, known, action, onExecute, onOpenCommands }: { projectName: string; projectId: string; running: boolean; known: boolean; action: StackActionState; onExecute: (command: string) => void; onOpenCommands: () => void }) {
  const busy = action.busy && action.projectId === projectId;
  return <div className="stack-action-group service-action-group" role="group" aria-label={`Actions for stack ${projectName}`}>
    <ServiceActionButton label="Start stack" icon="▶" disabled={(known && running) || busy} onClick={() => onExecute('up')} />
    <ServiceActionButton label="Restart stack" icon="↻" disabled={(known && !running) || busy} onClick={() => onExecute('restart')} />
    <ServiceActionButton label="Stop stack" icon="■" disabled={(known && !running) || busy} onClick={() => onExecute('stop')} />
    <ServiceActionButton label="Stack logs" icon="≡" disabled={busy} onClick={() => onExecute('logs')} />
    <ServiceActionButton label="More stack commands" icon="⋮" disabled={busy} onClick={onOpenCommands} />
  </div>;
}

"""
if anchor not in app: raise SystemExit('action group anchor not found')
app = app.replace(anchor, stack_group + anchor, 1)
app_path.write_text(app, encoding='utf-8')

styles_path = Path('src/ui/styles.css')
styles = styles_path.read_text(encoding='utf-8')
styles += """

.stack-card { display: grid; padding: 0; overflow: hidden; }
.stack-card-select { display: flex; width: 100%; justify-content: space-between; gap: .9rem; padding: .9rem; border: 0; border-radius: 0; text-align: left; background: transparent; box-shadow: none; }
.stack-action-group { width: fit-content; margin: 0 .9rem .75rem; }
.stack-action-feedback { margin: 0 .9rem .75rem; }
.compact-refresh-control { display: inline-flex; align-items: stretch; }
.compact-refresh-control select, .compact-refresh-control .refresh-icon-button { min-height: 2.8rem; border-radius: 0; }
.compact-refresh-control .refresh-icon-button { width: 2.8rem; padding: 0; border-radius: .8rem 0 0 .8rem; font-size: 1.1rem; }
.compact-refresh-control select { width: 7rem; border-left: 0; border-radius: 0 .8rem .8rem 0; }
"""
styles_path.write_text(styles, encoding='utf-8')

changelog_path = Path('CHANGELOG.md')
changelog = changelog_path.read_text(encoding='utf-8')
entry = '- Add direct stack-level actions to the Stacks list and compact the manual/automatic runtime refresh control.\n'
unreleased = '## [Unreleased]\n'
if entry not in changelog:
    changelog = changelog.replace(unreleased, unreleased + '\n' + entry, 1) if unreleased in changelog else entry + '\n' + changelog
    changelog_path.write_text(changelog, encoding='utf-8')
