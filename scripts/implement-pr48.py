from pathlib import Path
import re

app_path = Path('src/ui/App.tsx')
app = app_path.read_text(encoding='utf-8')

app = app.replace("import { createPublishedPortLink } from './service-runtime-ui';", "import { extractPublishedHostPorts } from './service-runtime-ui';", 1)
app = app.replace("const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(5000);", "const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(0);", 1)

pattern = re.compile(r"function ServicePortLinks\(\{ ports \}: \{ ports: string\[\] \}\) \{.*?\n\}", re.S)
replacement = """function ServicePortLinks({ ports }: { ports: string[] }) {
  const publishedPorts = extractPublishedHostPorts(ports);
  if (publishedPorts.length === 0) return null;
  return <div className=\"service-port-list\" aria-label=\"Published local ports\"><small>Published ports</small><div>{publishedPorts.map((port) => <span key={port} className=\"service-port-chip\" title={`Published local port ${port}`}>{port}</span>)}</div></div>;
}"""
app, count = pattern.subn(replacement, app, count=1)
if count != 1:
    raise SystemExit('ServicePortLinks marker missing')

app_path.write_text(app, encoding='utf-8')

css_path = Path('src/ui/styles.css')
css = css_path.read_text(encoding='utf-8')
addition = """

.service-port-chip { display: inline-flex; align-items: center; justify-content: center; min-width: 3.2rem; padding: .38rem .55rem; border: 1px solid rgba(56,189,248,.3); border-radius: .55rem; background: rgba(14,116,144,.12); color: #7dd3fc; font-size: .76rem; font-weight: 700; font-variant-numeric: tabular-nums; }
"""
if '.service-port-chip {' not in css:
    css += addition
css_path.write_text(css, encoding='utf-8')

changelog_path = Path('CHANGELOG.md')
changelog = changelog_path.read_text(encoding='utf-8')
line = '- Changed runtime refresh to Manual by default and display every unique published local port without assuming an HTTP endpoint.\n'
if line not in changelog:
    changelog = changelog.replace('## Unreleased\n', '## Unreleased\n\n' + line, 1)
changelog_path.write_text(changelog, encoding='utf-8')

Path('.github/pr-48.trigger').unlink(missing_ok=True)
Path('scripts/implement-pr48.py').unlink(missing_ok=True)
