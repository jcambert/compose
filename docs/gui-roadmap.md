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

## Non-goals for the first GUI iterations

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
- Local UI server: local Node HTTP server.
- Streaming: Server-Sent Events first for logs and runtime status updates.
- WebSocket: only later, if an interactive terminal-like experience is required.

The GUI is served by the CLI from `127.0.0.1` only. It should choose a free dynamic port by default and protect the session with a short-lived local token.

The first React MVP keeps packaging simple by serving a React browser shell directly from `compose ui`. A later build step can package bundled offline GUI assets once the UI/API contract is stable.

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

The CLI now routes through an application service boundary that is shared by future adapters.

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
```

Target direction:

```text
src/
  app/           reusable application services shared by CLI and GUI adapters
  cli/           terminal entrypoint, command registration and terminal adapters
  compose/       Docker Compose command model, builder and executor
  doctor/        diagnostics model and runner
  guided/        UI-neutral command descriptors
  interactive/   stack/service browsing workflow
  scanner/       Compose discovery
  workspace/     local workspaces, favorites and recents
  yaml/          Compose YAML parser/writer
```

The `app` modules are introduced incrementally, not through a large rewrite.

## Delivery plan

### Step 1 — Formalize GUI roadmap and product backlog

Document the GUI direction, product boundaries, technology choice and backlog order.

Expected output:

- `docs/gui-roadmap.md`
- updated `docs/backlog.md`

Status: completed in PR #19.

### Step 2 — Formalize reusable application services

Extract and stabilize application services that can be called by both the CLI and the future GUI.

Current services:

```text
src/app/scan-service.ts
src/app/doctor-service.ts
src/app/workspace-service.ts
src/app/stack-browser-service.ts
src/app/project-service.ts
src/app/compose-command-service.ts
src/app/compose-file-resolver.ts
```

Acceptance criteria:

- CLI commands delegate to reusable services.
- Application services do not depend on Commander or Inquirer.
- Tests cover application services directly.
- Existing CLI behaviour remains unchanged.

Status: completed in PR #20.

### Step 3 — Add `compose ui` with a minimal local server

Add a CLI command that starts a local-only HTTP server and exposes the first JSON endpoints.

Initial command shape:

```bash
compose ui
compose ui --port 0
compose ui --workspace dev
compose ui --no-open
```

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

Status: in progress through PR #24.

### Step 5 — Bundle local GUI assets

Move the React MVP from browser ESM imports to local bundled assets once the UX and API contract are stable.

Candidate outputs:

```text
dist/ui/index.html
dist/ui/assets/*
```

Acceptance criteria:

- `compose ui` can run without downloading browser dependencies.
- The npm package still remains CLI-first.
- The API contract does not change.

### Step 6 — Add streaming for logs and runtime updates

Use Server-Sent Events for long-running output and status refreshes.

Candidate endpoints:

```text
GET /api/events/runtime
GET /api/logs/stream
```

WebSocket support remains out of scope until a concrete bidirectional use case exists.

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
- Desktop packaging before the local server MVP proves valuable.
- Remote server behaviour without an explicit security design.
