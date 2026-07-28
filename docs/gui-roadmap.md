# GUI Roadmap

## Product stance

`compose` remains a command-line product first.

The graphical interface is an optional local view launched by the CLI. It must not become a second product with duplicated business rules, duplicated Docker Compose command generation, or a separate configuration model.

Target invocation:

```bash
compose ui
compose ui --workspace dev
compose ui --port 0
compose ui --no-open
```

The CLI stays fully usable without the GUI:

```bash
compose scan
compose browse
compose doctor
compose up --project ./infra --detach
compose logs --project ./infra api --follow
```

## Non-goals

The first GUI iterations must not introduce:

- Electron packaging.
- Tauri packaging.
- A desktop auto-update flow.
- A remote multi-user server.
- A template catalog.
- A second command model for the GUI.
- Business rules that only exist in the UI layer.

Desktop packaging can be reconsidered after the local browser-based GUI proves useful.

## Technology direction

The preferred implementation path is:

- Core and application services: TypeScript running in Node.js.
- UI: React in the browser.
- UI build: Vite bundled into local `dist/ui` assets.
- Local UI server: local Node HTTP server.
- Streaming: Server-Sent Events first for logs and runtime status updates.
- WebSocket: only later, if an interactive terminal-like experience is required.

The GUI is served by the CLI from `127.0.0.1` only. It chooses a free dynamic port by default and protects the session with a short-lived local token.

The React UI is bundled during the normal build and served from local package assets. The browser does not need to download React from an external ESM/CDN source at runtime.

The current UI is organized as a professional local admin console with Dashboard, Workspaces, Stacks, Doctor and Commands sections. It remains CLI-first and continues to reuse the same local API and command preview model.

## Architectural rule

The GUI must reuse the same core primitives as the CLI:

- Compose discovery.
- Runtime status reading.
- Workspace and favorite storage.
- Doctor diagnostics.
- Guided command descriptors.
- Compose command preview.
- Compose command execution.

The CLI and GUI must both resolve actions into the same typed command intent model before execution. The GUI must never parse terminal help output or rebuild Docker Compose commands independently.

## Current module direction

Current app boundary:

```text
src/app/scan-service.ts              scan Compose projects
src/app/compose-file-resolver.ts     resolve project/file targets
src/app/compose-command-service.ts   resolve, preview and execute Compose commands
src/app/project-service.ts           create/update/validate Compose projects
src/app/workspace-service.ts         manage workspaces and favorites
src/app/stack-browser-service.ts     wire browsing to workspace persistence
src/app/doctor-service.ts            expose diagnostics through the app boundary
src/app/config-service.ts            expose config export/import/path/reset
src/app/ui-server-service.ts         expose local GUI and JSON API
src/ui/                              React UI source bundled into dist/ui
```

The `app` modules are introduced incrementally, not through a large rewrite.

## Delivered milestones

### Step 1 — Formalize GUI roadmap and product backlog

Document the GUI direction, product boundaries, technology choice and backlog order.

Status: completed in PR #19.

### Step 2 — Formalize reusable application services

Extract and stabilize application services that can be called by both the CLI and the future GUI.

Acceptance criteria:

- CLI commands delegate to reusable services.
- Application services do not depend on Commander or Inquirer.
- Tests cover application services directly.
- Existing CLI behaviour remains unchanged.

Status: completed in PR #20.

### Step 3 — Add `compose ui` with a minimal local server

Add a CLI command that starts a local-only HTTP server and exposes the first JSON endpoints.

Initial endpoints:

```text
GET  /api/doctor
GET  /api/workspaces
GET  /api/stacks
GET  /api/stacks/:id/runtime
POST /api/commands/preview
POST /api/commands/execute
```

Acceptance criteria:

- The server binds to `127.0.0.1` by default.
- The default port can be dynamic.
- A local token protects API access.
- Destructive actions require explicit confirmation data in the request.
- The server can be tested without launching a browser.

Status: completed in PR #23.

### Step 4 — Add the React GUI MVP

Add a small React UI served by `compose ui`.

MVP screens:

- Doctor.
- Workspaces.
- Stack list.
- Stack detail.
- Service list.
- Command preview.
- Command execution result.

MVP constraints:

- The UI must show the generated `docker compose` command before executing meaningful operations.
- Destructive operations such as `down`, `kill` and `rm` require visible confirmation.
- The UI uses existing command descriptors and command intent models.
- The UI remains optional and is not required for CLI usage.
- The root page must include a visible fallback before React mounts.

Status: completed in PR #24, with the local UI rendering regression fixed in PR #27.

### Step 5 — Improve terminal browser navigation

Improve navigation when a workspace contains many stacks.

Delivered behaviours:

- `compose browse --filter <text>`.
- `compose browse --sort name|path|services|runtime`.
- Equivalent options through `compose stacks`.
- Favorites remain prioritized.
- Refresh and quit actions remain available when filters hide all stacks.

Status: completed in PR #25.

### Step 6 — Harden scanner behaviour for large directories

Keep broad source scans practical and safe.

Delivered behaviours:

- Expanded default exclusions.
- Case-insensitive directory exclusions.
- Symbolic link skipping.
- Scan guard rails for visited directories and inspected entries.
- `compose scan --exclude`.
- `compose scan --max-directories`.
- `compose scan --max-entries`.
- JSON stdout stays parseable while scan warnings go to stderr.

Status: completed in PR #26.

### Step 7 — Prepare v0.2.0 release

Prepare a release PR that updates version metadata and release notes after the stabilized UI and scanner milestones.

Delivered outputs:

```text
package.json
package-lock.json
CHANGELOG.md
README.md
docs/releases/v0.2.0.md
docs/release-readiness.md
```

Status: completed in PR #29.

### Step 8 — Bundle local GUI assets

Move the React MVP from browser ESM imports to local bundled assets.

Delivered outputs:

```text
src/ui/*
dist/ui/index.html
dist/ui/assets/*
```

Acceptance criteria:

- `compose ui` can run without downloading browser dependencies.
- The npm package still remains CLI-first.
- The API contract does not change.
- Missing source-built UI assets return a visible fallback instead of a blank page.

Status: completed in PR #30.

### Step 9 — Improve local UI user experience and professional layout

Move the bundled UI from a functional MVP toward a polished local admin console.

Delivered behaviours:

- Sidebar navigation with Dashboard, Stacks, Doctor and Commands sections.
- Professional top bar with workspace, local server status and refresh action.
- Dashboard summary cards for stack count, service count, doctor status and selected runtime.
- Stack browser with client-side search and sorting.
- Stack detail panel with service cards, runtime state, exposed ports and container names when available.
- Command workflow split into preview, confirmation and execution stages.
- Clear danger-zone messaging for destructive commands.
- Loading skeletons, empty states and error states.
- Responsive desktop/tablet layout.

Acceptance criteria:

- The GUI is easier to understand on first launch.
- The command safety model remains unchanged.
- The local API contract does not change.
- The CLI remains fully usable without the GUI.

Status: completed in PR #31.

### Step 10 — Manage workspaces from the local UI

Promote workspace configuration from read-only status to a first-class browser workflow.

Delivered behaviours:

- Dedicated Workspaces navigation entry.
- Create a saved workspace from the browser.
- Select the current workspace from the browser.
- Remove a saved workspace from the browser through token-protected local endpoints.
- Refresh stack data after workspace changes.
- Keep command state safe after workspace changes.

Status: completed in PR #32.

### Step 11 — Polish workspace management UX

Refine the workspace management screen after real UI feedback.

Delivered behaviours:

- More compact add/edit form.
- Edit mode for updating an existing workspace path.
- Readable monospace path chips with overflow handling.
- Clear current workspace state instead of a disabled Use button.
- Less aggressive remove action.
- Explicit remove confirmation before deletion.
- Success and error feedback retained in the workspace panel.

Status: completed in PR #33.

## Next delivery plan

### Step 12 — Add streaming for logs and runtime updates

Use Server-Sent Events for long-running output and status refreshes.

Candidate endpoints:

```text
GET /api/events/runtime
GET /api/logs/stream
```

WebSocket support remains out of scope until a concrete bidirectional use case exists.

### Step 13 — Improve Docker Compose error reporting

Normalize common Docker and Docker Compose command failures for both CLI and UI display.

Candidate behaviours:

- show command, working directory, compose file path and exit code consistently
- keep raw stdout/stderr available
- add actionable hints for Docker unavailable, Compose file missing and non-zero command failures
- reuse the same model in terminal and local UI flows

## Security and safety requirements

The local GUI must follow these rules:

- Bind to `127.0.0.1` unless a future explicit remote mode is designed.
- Use a short-lived local token.
- Avoid broad filesystem APIs exposed to the browser.
- Keep Docker Compose command execution explicit and visible.
- Require confirmations for destructive actions.
- Support dry-run/preview flows wherever command execution is available.

## Decision rules for future GUI work

A GUI task is allowed when it improves one of these goals:

- Makes existing CLI capabilities easier to inspect or operate.
- Reuses application services without duplicating logic.
- Improves visibility of Docker Compose command previews, runtime status or diagnostics.
- Keeps terminal workflows fully supported.

A GUI task should be rejected or postponed when it requires:

- A separate command model.
- A separate config format.
- Desktop packaging before the local server proves valuable.
- Remote server behaviour without an explicit security design.
