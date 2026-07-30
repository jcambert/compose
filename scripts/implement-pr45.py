from pathlib import Path
import re

app_path = Path('src/ui/App.tsx')
app = app_path.read_text(encoding='utf-8')

app = app.replace("import { ServicesView } from './ServicesView';\n", "import { ServicesView } from './ServicesView';\nimport { createPublishedPortLink } from './service-runtime-ui';\n", 1)
app = app.replace("  async function saveWorkspaceFromUi() {", "  function prepareServiceCommand(command: string, serviceName: string) {\n    setForm({ command, serviceName, confirmed: false, destructiveConfirmed: false, busy: false });\n    setActiveView('commands');\n  }\n\n  async function saveWorkspaceFromUi() {", 1)
app = app.replace("            onOpenCommands={() => setActiveView('commands')}\n            onRefreshRuntime={() => void refreshRuntime()}\n", "            onOpenCommands={() => setActiveView('commands')}\n            onPrepareServiceCommand={prepareServiceCommand}\n            onRefreshRuntime={() => void refreshRuntime()}\n", 1)

app = app.replace("  onOpenCommands,\n  onRefreshRuntime,\n}: {", "  onOpenCommands,\n  onPrepareServiceCommand,\n  onRefreshRuntime,\n}: {", 1)
app = app.replace("  onOpenCommands: () => void;\n  onRefreshRuntime: () => void;\n}) {", "  onOpenCommands: () => void;\n  onPrepareServiceCommand: (command: string, serviceName: string) => void;\n  onRefreshRuntime: () => void;\n}) {", 1)
app = app.replace("          <StackDetailPanel project={selectedProject} runtime={runtime} onOpenCommands={onOpenCommands} onRefreshRuntime={onRefreshRuntime} />", "          <StackDetailPanel project={selectedProject} runtime={runtime} onOpenCommands={onOpenCommands} onPrepareServiceCommand={onPrepareServiceCommand} onRefreshRuntime={onRefreshRuntime} />", 1)

detail_pattern = re.compile(r"function StackDetailPanel\(\{\n  project,\n  runtime,\n  onOpenCommands,\n  onRefreshRuntime,\n\}: \{\n  project\?: DiscoveredComposeProject;\n  runtime: RuntimeState;\n  onOpenCommands: \(\) => void;\n  onRefreshRuntime: \(\) => void;\n\}\) \{")
app, count = detail_pattern.subn("function StackDetailPanel({\n  project,\n  runtime,\n  onOpenCommands,\n  onPrepareServiceCommand,\n  onRefreshRuntime,\n}: {\n  project?: DiscoveredComposeProject;\n  runtime: RuntimeState;\n  onOpenCommands: () => void;\n  onPrepareServiceCommand: (command: string, serviceName: string) => void;\n  onRefreshRuntime: () => void;\n}) {", app, count=1)
if count != 1:
    raise SystemExit('StackDetailPanel signature not patched')

card_pattern = re.compile(r'''\s*<article key=\{service\} className="service-card">.*?</article>''', re.S)
card = '''
                  <article key={service} className="service-card professional-service-card">
                    <div className="service-card-header">
                      <div className="service-title-row">
                        <strong>{service}</strong>
                        <StatusPill tone={toneForServiceState(serviceStatus?.state)}>{serviceStatus?.state ?? 'unknown'}</StatusPill>
                      </div>
                      <ServiceActionGroup serviceName={service} state={serviceStatus?.state} onPrepare={onPrepareServiceCommand} onOpenCommands={onOpenCommands} />
                    </div>
                    <div className="service-runtime-meta">
                      <span>{serviceStatus?.containerCount ?? 0} containers</span>
                      {serviceStatus?.containerNames === undefined || serviceStatus.containerNames.length === 0 ? null : <small title={serviceStatus.containerNames.join(', ')}>Containers: {serviceStatus.containerNames.join(', ')}</small>}
                    </div>
                    <ServicePortLinks ports={serviceStatus?.ports ?? []} />
                  </article>'''
app, count = card_pattern.subn(card, app, count=1)
if count != 1:
    raise SystemExit('Service card not patched')

marker = "function MetricCard({ label, value, detail, tone }:"
components = '''function ServicePortLinks({ ports }: { ports: string[] }) {
  const links = ports.map((port) => ({ port, link: createPublishedPortLink(port) })).filter((entry) => entry.link !== undefined);
  if (links.length === 0) return <small className="service-port-empty">No published endpoint</small>;
  return <div className="service-port-list" aria-label="Published service ports"><small>Published ports</small><div>{links.map(({ port, link }) => link === undefined ? null : <a key={port} className="service-port-link" href={link.href} target="_blank" rel="noreferrer" title={link.title}><span>{link.label}</span><span aria-hidden="true">↗</span></a>)}</div></div>;
}

function ServiceActionGroup({ serviceName, state, onPrepare, onOpenCommands }: { serviceName: string; state?: string; onPrepare: (command: string, serviceName: string) => void; onOpenCommands: () => void }) {
  const running = state?.toLowerCase().includes('running') === true;
  return <div className="service-action-group" role="group" aria-label={`Actions for ${serviceName}`}>
    <ServiceActionButton label="Start" icon="▶" disabled={running} onClick={() => onPrepare('start', serviceName)} />
    <ServiceActionButton label="Restart" icon="↻" disabled={!running} onClick={() => onPrepare('restart', serviceName)} />
    <ServiceActionButton label="Stop" icon="■" disabled={!running} onClick={() => onPrepare('stop', serviceName)} />
    <ServiceActionButton label="Logs" icon="≡" onClick={() => onPrepare('logs', serviceName)} />
    <ServiceActionButton label="More commands" icon="⋮" onClick={onOpenCommands} />
  </div>;
}

function ServiceActionButton({ label, icon, disabled = false, onClick }: { label: string; icon: string; disabled?: boolean; onClick: () => void }) {
  return <button className="service-action-button" type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}><span aria-hidden="true">{icon}</span></button>;
}

'''
if marker not in app:
    raise SystemExit('MetricCard marker missing')
app = app.replace(marker, components + marker, 1)
app_path.write_text(app, encoding='utf-8')

Path('src/ui/service-runtime-ui.ts').write_text('''export type PublishedPortLink = { href: string; label: string; title: string };

export function createPublishedPortLink(value: string): PublishedPortLink | undefined {
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  const arrow = normalized.indexOf('->');
  const publishedPart = arrow < 0 ? normalized : normalized.slice(0, arrow);
  const targetPart = arrow < 0 ? undefined : normalized.slice(arrow + 2);
  const published = parseHostAndPort(publishedPart.replace(/\\/(tcp|udp)$/i, ''));
  if (published === undefined) return undefined;
  const targetPort = targetPart?.match(/(\\d+)(?:\\/(tcp|udp))?$/i)?.[1];
  const protocol = published.port === 443 || published.port === 8443 || targetPort === '443' ? 'https' : 'http';
  const host = normalizeBrowserHost(published.host);
  return { href: `${protocol}://${formatUrlHost(host)}:${published.port}`, label: `${host}:${published.port}${targetPort === undefined ? '' : ` → ${targetPort}`}`, title: `Open ${protocol.toUpperCase()} endpoint for ${normalized}` };
}

function parseHostAndPort(value: string): { host: string; port: number } | undefined {
  const bracketed = /^\\[([^\\]]+)\\]:(\\d+)$/.exec(value);
  if (bracketed?.[1] !== undefined && bracketed[2] !== undefined) return { host: bracketed[1], port: Number(bracketed[2]) };
  const segments = value.split(':');
  const portValue = segments.pop();
  if (portValue === undefined || !/^\\d+$/.test(portValue)) return undefined;
  return { host: segments.join(':') || 'localhost', port: Number(portValue) };
}

function normalizeBrowserHost(host: string): string {
  const normalized = host.trim().toLowerCase();
  return normalized === '' || normalized === '0.0.0.0' || normalized == '::' || normalized === '[::]' || normalized === '*' ? 'localhost' : host;
}

function formatUrlHost(host: string): string { return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host; }
''', encoding='utf-8')

css = Path('src/ui/styles.css')
css.write_text(css.read_text(encoding='utf-8') + '''

.professional-service-card { display: grid; gap: .9rem; min-height: 10.5rem; padding: 1rem; border-color: rgba(148,163,184,.22); background: linear-gradient(180deg,rgba(17,28,49,.96),rgba(12,22,40,.96)); transition: border-color 160ms ease,transform 160ms ease,box-shadow 160ms ease; }
.professional-service-card:hover { border-color: rgba(96,165,250,.42); box-shadow: 0 12px 28px rgba(2,8,23,.24); transform: translateY(-1px); }
.service-card-header { display: grid; gap: .75rem; }
.service-title-row strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.service-action-group { display: inline-flex; width: fit-content; overflow: hidden; border: 1px solid rgba(148,163,184,.28); border-radius: .65rem; background: rgba(7,17,31,.72); }
.service-action-button { display: grid; width: 2.35rem; height: 2.2rem; padding: 0; place-items: center; border: 0; border-right: 1px solid rgba(148,163,184,.2); border-radius: 0; background: transparent; color: #bfdbfe; font-size: .95rem; box-shadow: none; }
.service-action-button:last-child { border-right: 0; }
.service-action-button:hover:not(:disabled) { background: rgba(59,130,246,.18); color: #fff; transform: none; }
.service-action-button:focus-visible { position: relative; z-index: 1; outline: 2px solid #60a5fa; outline-offset: -2px; }
.service-action-button:disabled { cursor: not-allowed; color: #53627a; opacity: .58; }
.service-runtime-meta { display: grid; gap: .25rem; color: var(--muted); }
.service-runtime-meta small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.service-port-list { display: grid; gap: .45rem; }
.service-port-list > small,.service-port-empty { color: var(--muted); }
.service-port-list > div { display: flex; flex-wrap: wrap; gap: .4rem; }
.service-port-link { display: inline-flex; align-items: center; gap: .35rem; max-width: 100%; padding: .38rem .55rem; border: 1px solid rgba(56,189,248,.3); border-radius: .55rem; background: rgba(14,116,144,.12); color: #7dd3fc; font-size: .76rem; font-weight: 700; text-decoration: none; }
.service-port-link:hover { border-color: rgba(125,211,252,.65); background: rgba(14,116,144,.22); color: #e0f2fe; }
@media (min-width: 1160px) { .service-card-header { grid-template-columns: minmax(0,1fr) auto; align-items: start; } }
''', encoding='utf-8')

Path('tests/unit/service-runtime-ui.test.ts').write_text('''import { describe, expect, it } from 'vitest';
import { createPublishedPortLink } from '../../src/ui/service-runtime-ui';

describe('service runtime UI port links', () => {
  it.each([
    ['0.0.0.0:3000->3000/tcp', 'http://localhost:3000', 'localhost:3000 → 3000'],
    ['[::]:8443->443/tcp', 'https://localhost:8443', 'localhost:8443 → 443'],
    ['127.0.0.1:8080->80/tcp', 'http://127.0.0.1:8080', '127.0.0.1:8080 → 80'],
    ['localhost:5173', 'http://localhost:5173', 'localhost:5173'],
  ])('creates a browser endpoint for %s', (value, href, label) => expect(createPublishedPortLink(value)).toMatchObject({ href, label }));
  it('ignores non-published descriptions', () => { expect(createPublishedPortLink('3000/tcp')).toBeUndefined(); expect(createPublishedPortLink('')).toBeUndefined(); });
});
''', encoding='utf-8')

changelog = Path('CHANGELOG.md')
text = changelog.read_text(encoding='utf-8')
anchor = '- Added realistic Compose fixtures covering anchors, extension fields, health checks, deploy settings, networks, secrets, configs, LF/CRLF input and stale previews.\n'
addition = '- Added professional runtime service cards with safe command shortcuts and clickable published-port endpoints.\n'
if addition not in text:
    text = text.replace(anchor, anchor + addition, 1)
changelog.write_text(text, encoding='utf-8')

backlog = Path('docs/backlog.md')
text = backlog.read_text(encoding='utf-8')
if '## Completed: professional service runtime cards (#45)' not in text:
    text += '\n\n## Completed: professional service runtime cards (#45)\n\nThe selected-stack runtime view presents each service with a clear state badge, clickable published endpoints and a compact action group for start, restart, stop, logs and advanced command preparation. Actions continue to use the existing preview and confirmation workflow.\n'
backlog.write_text(text, encoding='utf-8')

Path('.github/pr-45.trigger').unlink(missing_ok=True)
Path('scripts/implement-pr45.py').unlink(missing_ok=True)
