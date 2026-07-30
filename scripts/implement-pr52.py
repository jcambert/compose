from pathlib import Path

app_path = Path('src/ui/App.tsx')
app = app_path.read_text(encoding='utf-8')
old = """function ServicePortLinks({ ports }: { ports: string[] }) {
  const publishedPorts = extractPublishedHostPorts(ports);
  if (publishedPorts.length === 0) return null;
  return <div className=\"service-port-list\" aria-label=\"Published local ports\"><small>Published ports</small><div>{publishedPorts.map((port) => <span key={port} className=\"service-port-chip\" title={`Published local port ${port}`}>{port}</span>)}</div></div>;
}
"""
new = """function ServicePortLinks({ ports }: { ports: string[] }) {
  const publishedPorts = extractPublishedHostPorts(ports);
  if (publishedPorts.length === 0) return null;

  return (
    <div className=\"service-port-list\" aria-label=\"Published local ports\">
      <small>Published ports</small>
      <div>
        {publishedPorts.map((port) => (
          <a
            key={port}
            className=\"service-port-chip\"
            href={`http://localhost:${port}`}
            target=\"_blank\"
            rel=\"noopener noreferrer\"
            title={`Open localhost:${port} in a new tab`}
            aria-label={`Open published port ${port} in a new tab`}
          >
            <span>{port}</span>
            <span aria-hidden=\"true\">↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}
"""
if old not in app:
    raise SystemExit('ServicePortLinks marker not found')
app_path.write_text(app.replace(old, new, 1), encoding='utf-8')

styles_path = Path('src/ui/styles.css')
styles = styles_path.read_text(encoding='utf-8')
marker = ".service-port-chip {"
index = styles.find(marker)
if index < 0:
    raise SystemExit('service-port-chip style marker not found')
open_brace = styles.find('{', index)
close_brace = styles.find('}', open_brace)
block = styles[index:close_brace + 1]
additions = """
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: border-color 120ms ease, background-color 120ms ease, transform 120ms ease;
"""
if 'text-decoration: none;' not in block:
    updated_block = block[:-1] + additions + '}'
    styles = styles[:index] + updated_block + styles[close_brace + 1:]

if '.service-port-chip:hover' not in styles:
    styles += """

.service-port-chip:hover,
.service-port-chip:focus-visible {
  border-color: var(--accent, #3b82f6);
  background: rgba(59, 130, 246, 0.14);
  transform: translateY(-1px);
  outline: none;
}
"""
styles_path.write_text(styles, encoding='utf-8')

changelog_path = Path('CHANGELOG.md')
changelog = changelog_path.read_text(encoding='utf-8')
entry = '- Make every published service port clickable from the Stacks page, opening `http://localhost:<port>` in a new browser tab.\n'
if entry not in changelog:
    unreleased = '## [Unreleased]\n'
    changelog = changelog.replace(unreleased, unreleased + '\n' + entry, 1) if unreleased in changelog else entry + '\n' + changelog
    changelog_path.write_text(changelog, encoding='utf-8')
