from pathlib import Path
import re

app_path = Path('src/ui/App.tsx')
app = app_path.read_text(encoding='utf-8')

old_map = '''              services.map((service) => {
                const serviceStatus = status?.services?.[service];

                return (
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
                  </article>
                );
              })'''

new_map = '''              services.map((service) => {
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
                      <ServiceActionGroup serviceName={service} state={serviceStatus?.state} onPrepare={onPrepareServiceCommand} onOpenCommands={onOpenCommands} />
                    </div>
                    {containerCount > 0 ? (
                      <div className="service-runtime-meta">
                        <span>{containerCount} {containerCount === 1 ? 'container' : 'containers'}</span>
                        {serviceStatus?.containerNames === undefined || serviceStatus.containerNames.length === 0 ? null : <small title={serviceStatus.containerNames.join(', ')}>Containers: {serviceStatus.containerNames.join(', ')}</small>}
                      </div>
                    ) : null}
                    {ports.length > 0 ? <ServicePortLinks ports={ports} /> : null}
                  </article>
                );
              })'''

if old_map not in app:
    raise SystemExit('service card block not found')
app = app.replace(old_map, new_map, 1)

old_empty = "  if (links.length === 0) return <small className=\"service-port-empty\">No published endpoint</small>;"
new_empty = "  if (links.length === 0) return null;"
if old_empty not in app:
    raise SystemExit('empty port message not found')
app = app.replace(old_empty, new_empty, 1)
app_path.write_text(app, encoding='utf-8')

styles_path = Path('src/ui/styles.css')
styles = styles_path.read_text(encoding='utf-8')
styles = re.sub(r'\.professional-service-card \{[^\n]*\}', '.professional-service-card { display: flex; flex-direction: column; gap: .8rem; min-height: 0; padding: 1rem; overflow: hidden; border-color: rgba(148,163,184,.22); background: linear-gradient(180deg,rgba(17,28,49,.96),rgba(12,22,40,.96)); transition: border-color 160ms ease,transform 160ms ease,box-shadow 160ms ease; }', styles, count=1)
styles = re.sub(r'\.service-card-header \{[^\n]*\}', '.service-card-header { display: flex; flex-direction: column; align-items: stretch; gap: .75rem; min-width: 0; }', styles, count=1)
styles = re.sub(r'\.service-title-row strong \{[^\n]*\}', '.service-title-row { display: flex; align-items: center; justify-content: space-between; gap: .75rem; min-width: 0; }\n.service-name { min-width: 0; overflow: hidden; color: var(--text); font-size: 1rem; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }\n.service-title-row .status-pill { flex: 0 0 auto; }', styles, count=1)
styles = re.sub(r'\.service-action-group \{[^\n]*\}', '.service-action-group { display: inline-flex; align-self: flex-start; max-width: 100%; overflow: hidden; border: 1px solid rgba(148,163,184,.28); border-radius: .65rem; background: rgba(7,17,31,.72); }', styles, count=1)
styles = re.sub(r'@media \(min-width: 1160px\) \{ \.service-card-header \{[^\n]*\} \}', '@media (min-width: 1160px) { .service-card-header { display: flex; } }', styles, count=1)
styles_path.write_text(styles, encoding='utf-8')

changelog = Path('CHANGELOG.md')
text = changelog.read_text(encoding='utf-8')
anchor = '- Added professional runtime service cards with safe command shortcuts and clickable published-port endpoints.\n'
addition = '- Fixed compact service card layout and removed irrelevant empty runtime details for stopped services.\n'
if addition not in text:
    text = text.replace(anchor, anchor + addition, 1)
changelog.write_text(text, encoding='utf-8')

Path('scripts/fix-service-card-layout.py').unlink(missing_ok=True)
Path('.github/workflows/fix-service-card-layout.yml').unlink(missing_ok=True)
