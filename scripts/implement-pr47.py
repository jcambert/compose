from pathlib import Path
import re

app_path = Path('src/ui/App.tsx')
app = app_path.read_text(encoding='utf-8')

app = app.replace("type StackSortMode = 'name' | 'path' | 'services' | 'runtime';", "type StackSortMode = 'name' | 'path' | 'services' | 'runtime';\ntype RefreshInterval = 0 | 5000 | 10000 | 30000 | 60000;\ntype ServiceActionState = { serviceName?: string; command?: string; busy: boolean; message?: string; error?: string };", 1)

app = app.replace("  const [runtime, setRuntime] = useState<RuntimeState>({ loading: false });", "  const [runtime, setRuntime] = useState<RuntimeState>({ loading: false });\n  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(5000);\n  const [serviceAction, setServiceAction] = useState<ServiceActionState>({ busy: false });", 1)

old_prepare = """  function prepareServiceCommand(command: string, serviceName: string) {
    setForm({ command, serviceName, confirmed: false, destructiveConfirmed: false, busy: false });
    setActiveView('commands');
  }
"""
new_execute = """  async function executeServiceCommand(command: string, serviceName: string) {
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
"""
if old_prepare not in app:
    raise SystemExit('prepareServiceCommand marker missing')
app = app.replace(old_prepare, new_execute, 1)

old_effect = """  useEffect(() => {
    void refreshRuntime(selectedProject);
  }, [selectedProject, token]);
"""
new_effect = """  useEffect(() => {
    void refreshRuntime(selectedProject);
  }, [selectedProject, token]);

  useEffect(() => {
    if (activeView !== 'stacks' || selectedProject === undefined || refreshInterval === 0) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshRuntime(selectedProject);
    }, refreshInterval);
    return () => window.clearInterval(timer);
  }, [activeView, refreshInterval, selectedProject, token]);
"""
if old_effect not in app:
    raise SystemExit('runtime effect marker missing')
app = app.replace(old_effect, new_effect, 1)

app = app.replace("            onPrepareServiceCommand={prepareServiceCommand}\n            onRefreshRuntime={() => void refreshRuntime()}\n", "            serviceAction={serviceAction}\n            refreshInterval={refreshInterval}\n            onRefreshIntervalChange={setRefreshInterval}\n            onExecuteServiceCommand={(command, serviceName) => void executeServiceCommand(command, serviceName)}\n            onRefreshRuntime={() => void refreshRuntime()}\n", 1)

app = app.replace("  onPrepareServiceCommand,\n  onRefreshRuntime,\n}: {", "  serviceAction,\n  refreshInterval,\n  onRefreshIntervalChange,\n  onExecuteServiceCommand,\n  onRefreshRuntime,\n}: {", 1)
app = app.replace("  onPrepareServiceCommand: (command: string, serviceName: string) => void;\n  onRefreshRuntime: () => void;\n}) {", "  serviceAction: ServiceActionState;\n  refreshInterval: RefreshInterval;\n  onRefreshIntervalChange: (value: RefreshInterval) => void;\n  onExecuteServiceCommand: (command: string, serviceName: string) => void;\n  onRefreshRuntime: () => void;\n}) {", 1)
app = app.replace("          <StackDetailPanel project={selectedProject} runtime={runtime} onOpenCommands={onOpenCommands} onPrepareServiceCommand={onPrepareServiceCommand} onRefreshRuntime={onRefreshRuntime} />", "          <StackDetailPanel project={selectedProject} runtime={runtime} serviceAction={serviceAction} refreshInterval={refreshInterval} onRefreshIntervalChange={onRefreshIntervalChange} onExecuteServiceCommand={onExecuteServiceCommand} onOpenCommands={onOpenCommands} onRefreshRuntime={onRefreshRuntime} />", 1)

signature_pattern = re.compile(r"function StackDetailPanel\(\{\n  project,\n  runtime,\n  onOpenCommands,\n  onPrepareServiceCommand,\n  onRefreshRuntime,\n\}: \{\n  project\?: DiscoveredComposeProject;\n  runtime: RuntimeState;\n  onOpenCommands: \(\) => void;\n  onPrepareServiceCommand: \(command: string, serviceName: string\) => void;\n  onRefreshRuntime: \(\) => void;\n\}\) \{")
replacement = """function StackDetailPanel({
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
}) {"""
app, count = signature_pattern.subn(replacement, app, count=1)
if count != 1:
    raise SystemExit('StackDetailPanel signature not patched')

old_actions = """            <div className="detail-actions">
              <button className="secondary" type="button" onClick={onRefreshRuntime} disabled={runtime.loading}>Refresh runtime</button>
              <button type="button" onClick={onOpenCommands}>Prepare command</button>
            </div>
"""
new_actions = """            <div className="detail-actions runtime-refresh-controls">
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
if old_actions not in app:
    raise SystemExit('detail actions marker missing')
app = app.replace(old_actions, new_actions, 1)

app = app.replace("                      <ServiceActionGroup serviceName={service} state={serviceStatus?.state} onPrepare={onPrepareServiceCommand} onOpenCommands={onOpenCommands} />", "                      <ServiceActionGroup serviceName={service} state={serviceStatus?.state} action={serviceAction} onExecute={onExecuteServiceCommand} onOpenCommands={onOpenCommands} />", 1)
app = app.replace("                    {ports.length > 0 ? <ServicePortLinks ports={ports} /> : null}\n", "                    {ports.length > 0 ? <ServicePortLinks ports={ports} /> : null}\n                    {serviceAction.serviceName === service && serviceAction.message !== undefined ? <small className=\"service-action-feedback success\">{serviceAction.message}</small> : null}\n                    {serviceAction.serviceName === service && serviceAction.error !== undefined ? <small className=\"service-action-feedback error\">{serviceAction.error}</small> : null}\n", 1)

old_group = re.compile(r"function ServiceActionGroup\(\{ serviceName, state, onPrepare, onOpenCommands \}: \{ serviceName: string; state\?: string; onPrepare: \(command: string, serviceName: string\) => void; onOpenCommands: \(\) => void \}\) \{.*?\n\}", re.S)
new_group = """function ServiceActionGroup({ serviceName, state, action, onExecute, onOpenCommands }: { serviceName: string; state?: string; action: ServiceActionState; onExecute: (command: string, serviceName: string) => void; onOpenCommands: () => void }) {
  const running = state?.toLowerCase().includes('running') === true;
  const busy = action.busy && action.serviceName === serviceName;
  return <div className="service-action-group" role="group" aria-label={`Actions for ${serviceName}`}>
    <ServiceActionButton label="Start" icon="▶" disabled={running || busy} onClick={() => onExecute('start', serviceName)} />
    <ServiceActionButton label="Restart" icon="↻" disabled={!running || busy} onClick={() => onExecute('restart', serviceName)} />
    <ServiceActionButton label="Stop" icon="■" disabled={!running || busy} onClick={() => onExecute('stop', serviceName)} />
    <ServiceActionButton label="Logs" icon="≡" disabled={busy} onClick={() => onExecute('logs', serviceName)} />
    <ServiceActionButton label="More commands" icon="⋮" disabled={busy} onClick={onOpenCommands} />
  </div>;
}"""
app, count = old_group.subn(new_group, app, count=1)
if count != 1:
    raise SystemExit('ServiceActionGroup not patched')

app_path.write_text(app, encoding='utf-8')

css_path = Path('src/ui/styles.css')
css = css_path.read_text(encoding='utf-8')
css += """

.status-line { margin-bottom: 1rem; }
.runtime-refresh-controls { align-items: end; flex-wrap: wrap; }
.refresh-interval-control { display: grid; gap: .25rem; min-width: 7rem; }
.refresh-interval-control span { color: var(--muted); font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.refresh-interval-control select { min-height: 2.5rem; }
.service-action-feedback { display: block; padding-top: .25rem; font-weight: 700; }
.service-action-feedback.success { color: #86efac; }
.service-action-feedback.error { color: #fca5a5; }
"""
css_path.write_text(css, encoding='utf-8')

changelog = Path('CHANGELOG.md')
text = changelog.read_text(encoding='utf-8')
anchor = '- Fixed stopped service card spacing so the service name, state and action toolbar remain readable without empty runtime details.\n'
addition = '- Added direct service actions, per-service feedback and configurable runtime auto-refresh with a 5-second default.\n'
if addition not in text:
    if anchor in text:
        text = text.replace(anchor, anchor + addition, 1)
    else:
        text = text.replace('## Unreleased\n', '## Unreleased\n\n' + addition, 1)
changelog.write_text(text, encoding='utf-8')

Path('.github/pr-47.trigger').unlink(missing_ok=True)
Path('scripts/implement-pr47.py').unlink(missing_ok=True)
