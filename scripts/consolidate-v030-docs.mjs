import { readFile, writeFile } from 'node:fs/promises';

const changelog = await readFile('CHANGELOG.md', 'utf8');
const historyIndex = changelog.indexOf('## 0.2.2');
if (historyIndex < 0) throw new Error('0.2.2 changelog history not found');

const release = `# Changelog

All notable changes to this project are documented here.

The project follows a pragmatic semver policy:

- patch releases fix bugs, docs or CI/release infrastructure
- minor releases add compatible user-facing commands or workflows
- major releases introduce breaking command syntax or configuration changes

## Unreleased

## 0.3.0 - Guided Compose editing and professional local administration

### Added

- Guided browser workflows to create, update and remove Compose services with YAML diff preview and explicit confirmation.
- Targeted YAML editing that preserves unsupported service keys and top-level Compose sections.
- Direct Start, Restart, Stop, Logs and advanced actions for services and complete stacks.
- Published local port controls that show every unique host port and open it in a new browser tab.
- Manual and optional automatic runtime refresh controls.
- Realistic Compose fixtures and Windows installed-package validation.

### Changed

- Workspace activation reloads stack discovery and clears stale selection and runtime data.
- \`compose ui --workspace <name>\` takes precedence at startup and becomes the last opened workspace.
- Browser API reads bypass caching to prevent stale stack lists after workspace switches.
- Runtime cards hide irrelevant empty details and use a compact professional layout.

### Fixed

- Service-card title, spacing and action alignment issues.
- Published-port parsing and IPv4/IPv6 deduplication.
- Windows npm shim and paths-with-spaces execution issues.

### Notes

\`0.3.0\` is backward compatible. The CLI remains primary; \`compose ui\` remains optional, local-only and token-protected.

`;

await writeFile('CHANGELOG.md', release + changelog.slice(historyIndex), 'utf8');

let readme = await readFile('README.md', 'utf8');
if (!readme.includes('## What is new in 0.3.0')) {
  const section = `## What is new in 0.3.0

- Guided Compose service creation, update and deletion with YAML diff review.
- Direct stack and service lifecycle actions from the local Stacks page.
- Reliable workspace switching and \`compose ui --workspace <name>\` startup precedence.
- Clickable published local ports and compact manual or automatic runtime refresh.
- Linux Node.js 20/22 and Windows installed-package validation.

`;
  readme = readme.replace('## Installation\n', section + '## Installation\n');
  await writeFile('README.md', readme, 'utf8');
}
