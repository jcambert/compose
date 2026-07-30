from pathlib import Path

script_path = Path('scripts/implement-pr45.py')
source = script_path.read_text(encoding='utf-8')
old = "  const arrow = normalized.indexOf('->');\n  const publishedPart = arrow < 0 ? normalized : normalized.slice(0, arrow);"
new = "  const arrow = normalized.indexOf('->');\n  if (arrow < 0 && !normalized.includes(':')) return undefined;\n  const publishedPart = arrow < 0 ? normalized : normalized.slice(0, arrow);"
if old not in source:
    raise SystemExit('Published port marker not found')
exec(compile(source.replace(old, new, 1), str(script_path), 'exec'))
Path('scripts/implement-pr45-fixed.py').unlink(missing_ok=True)
Path('.github/pr-45.retry').unlink(missing_ok=True)
