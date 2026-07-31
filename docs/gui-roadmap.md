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
- Raw YAML editing as the only way to modify Compose services.

Desktop packaging can be reconsidered after the local browser-based GUI proves useful.

## Technology direction

The preferred implementation path is:

- Core and application services: TypeScript running in Node.js.
- UI: React in the browser.
- UI build: Vite bundled into local `dist/ui` assets.
- Local UI server: local Node HTTP server.
- Streaming: Server-Sent Events first for logs and runtime status updates.
- WebSocket: only later, if an interactive terminal-like experience is required.
- Compose editing: YAML document parsing and targeted mutations through shared application services.

The GUI is served by the CLI from `127.0.0.1` only. It chooses a free dynamic port by default and protects the session with a short-lived local token.

The React UI is bundled during the normal build and served from local package assets. The browser does not need to download React from an external ESM/CDN source at runtime.

The current UI is organized as a professional local admin console with Dashboard, Workspaces, Stacks, Doctor and Commands sections. It remains CLI-first and continues to reuse the same local API, streaming endpoints, command preview model and command failure diagnostic model.

## Architectural rule

The GUI must reuse the same core primitives as the CLI:

- Compose discovery.
- Runtime status reading.
- Workspace and favorite storage.
- Doctor diagnostics.
- Guided command descriptors.
- Compose command preview.
- Compose command execution.
- Compose command failure diagnostics.
- Read-only runtime and log streaming.
- Compose YAML parsing and validation.
- Guided service definition editing.

The CLI and GUI must both resolve actions into the same typed command intent model before execution. The GUI must never parse terminal help output or rebuild Docker Compose commands independently.

For Compose file editing, the GUI must not become a raw text editor first. It should expose guided forms for common service fields, show a preview of the YAML changes, validate before save and preserve unsupported advanced YAML sections.

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
src/app/ui-server-service.ts         expose local GUI, JSON API and SSE streams
src/compose/compose-error-reporting.ts normalize Docker Compose command failures
src/yaml/                            parse and validate Compose documents
src/ui/                              React UI source bundled into dist/ui
```

Planned app boundary for guided Compose editing:

```text
src/app/compose-editing-service.ts   list, create, update and delete Compose services safely
src/yaml/compose-service-editor.ts   apply targeted service mutations while preserving YAML content
src/ui/compose-editor*               guided browser forms for non-specialist users
```

## Delivered milestones

### Step 1 — Formalize GUI roadmap and product backlog

Status: completed in PR #19.

### Step 2 — Formalize reusable application services

Status: completed in PR #20.

### Step 3 — Add `compose ui` with a minimal local server

Status: completed in PR #23.

### Step 4 — Add the React GUI MVP

Status: completed in PR #24, with the local UI rendering regression fixed in PR #27.

### Step 5 — Improve terminal browser navigation

Delivered behaviours:

- `compose browse --filter <text>`.
- `compose browse --sort name|path|services|runtime`.
- Equivalent options through `compose stacks`.
- Favorites remain prioritized.
- Refresh and quit actions remain available when filters hide all stacks.

Status: completed in PR #25.

### Step 6 — Harden scanner behaviour for large directories

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

Status: completed in PR #29.

### Step 8 — Bundle local GUI assets

Delivered behaviours:

- `compose ui` can run without downloading browser dependencies.
- The npm package remains CLI-first.
- The API contract does not change.
- Missing source-built UI assets return a visible fallback instead of a blank page.

Status: completed in PR #30.

### Step 9 — Improve local UI user experience and professional layout

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

Status: completed in PR #31.

### Step 10 — Manage and polish workspaces from the UI

Delivered behaviours:

- Create saved workspaces from `compose ui`.
- Select the current workspace from `compose ui`.
- Remove a workspace with visible confirmation.
- Edit the path of an existing workspace.
- Keep the current workspace visually distinct.
- Keep workspace changes local, token-protected and backed by the same config as the CLI.

Status: completed in PR #32 and polished in PR #33.

### Step 11 — Add streaming for logs and runtime updates

Delivered behaviours:

- `GET /api/events/runtime` streams selected stack runtime updates.
- `GET /api/logs/stream` streams `docker compose logs --follow` output.
- Streams remain local-only, token-protected and read-only.
- The browser can stop log streaming without killing the UI server.
- The local UI exposes a compact live streams panel.
- The Live streams panel can close from its header or with `Escape`.
- The Live streams panel follows the stack selected in the Stacks view and clears stale stream output on stack changes.
- Scrollable stack and live-output areas use themed scrollbars.
- The Live streams launcher is hidden while the panel is already open.
- WebSocket support remains out of scope until a concrete bidirectional use case exists.

Status: runtime/log streaming completed in PR #34; Live streams UX polish completed in PR #35 and PR #38.

### Step 12 — Improve Docker Compose error reporting

Delivered behaviours:

- Failed command results include a structured `diagnostic` object.
- The diagnostic identifies unavailable Docker, missing Compose files and generic non-zero Docker Compose failures.
- Generated command, working directory, Compose file path and exit code are surfaced consistently.
- Raw stdout/stderr remain available for troubleshooting.
- Terminal execution with the default Docker runner prints the diagnostic summary.
- Local UI command execution receives the same typed execution result model.

Status: completed in PR #36.

### Step 13 — Prepare v0.2.1 and v0.2.2 patch releases

Delivered behaviours:

- `v0.2.1` release metadata prepared after workspace UI management, GUI streaming, live streams UX fixes and structured command diagnostics.
- `v0.2.2` release metadata prepared after the post-publication UI polish from PR #38.

Status: `v0.2.1` completed in PR #37; `v0.2.2` prepared in PR #39.

### Step 14 — Design simplified Compose YAML editing

Define the architecture and user experience for editing Compose service definitions without requiring the user to know Docker Compose YAML details.

Delivered design outputs:

- App service contract for listing, creating, updating and deleting service definitions.
- YAML mutation strategy that preserves unsupported advanced keys.
- Guided service form model for image/build, ports, environment, volumes, depends_on, command and restart policy.
- Diff preview and validation flow before saving.
- Safety rules for local-only, token-protected file writes.
- Test plan for parser, mutation service, UI API and browser workflows.

Status: completed in PR #40.

## Compose editing delivery

### Step 15 — Add Compose document editing service

Delivered behaviours:

- Shared application service for reading and validating selected Compose files.
- Targeted service create, update and delete mutations.
- Exact YAML diff preview before save.
- Optimistic file-change protection.
- Preservation of unsupported service and top-level keys.

Status: completed.

### Step 16 — Expose guided service editing in the local UI

Delivered behaviours:

- Guided forms for common service fields.
- Create and delete workflows with explicit confirmation.
- Diff review, validation errors and structured diagnostics.
- Shared runtime and lifecycle actions.

Status: completed.

### Step 17 — Deliver a unified Dockge-style Compose workspace

Delivered behaviours:

- Complete Compose YAML and `.env` editing with syntax highlighting.
- Stack creation, save-draft and deploy workflows.
- Stack and service lifecycle actions, operation output and runtime status.
- Network and safe `x-dockge.urls` summaries.
- Transactional replacement, optimistic concurrency and conservative stack deletion.
- Dirty-state guards and lazy-loaded editor assets.
- A dedicated parity backlog and architecture decision record.

Status: completed in PR #55 after both required GitHub Actions workflows passed.

## Security and safety requirements

The local GUI must follow these rules:

- Bind to `127.0.0.1` unless a future explicit remote mode is designed.
- Use a short-lived local token.
- Avoid broad filesystem APIs exposed to the browser.
- Keep streaming endpoints read-only.
- Keep Docker Compose command execution explicit and visible.
- Require confirmations for destructive actions.
- Support dry-run/preview flows wherever command execution is available.
- Keep command diagnostics read-only and avoid hiding raw Docker Compose output.
- Keep Compose file writes local-only and token-protected.
- Preview YAML mutations before writing to disk.
- Validate Compose documents before saving.
- Preserve existing advanced YAML content unless explicitly changed.

## Decision rules for future GUI work

A GUI task is allowed when it improves one of these goals:

- Makes existing CLI capabilities easier to inspect or operate.
- Reuses application services without duplicating logic.
- Improves visibility of Docker Compose command previews, runtime status, logs or diagnostics.
- Simplifies Compose service editing for non-specialist users while preserving the real Compose file.
- Keeps terminal workflows fully supported.

A GUI task should be rejected or postponed when it requires:

- A separate command model.
- A separate config format.
- Desktop packaging before the local server proves valuable.
- Remote server behaviour without an explicit security design.
- Replacing Docker Compose semantics with an incompatible abstraction.

## Compose service editing status

- [x] Shared Compose editing application service.
- [x] Token-protected stack service endpoints.
- [x] Guided browser forms for create, update and delete.
- [x] YAML diff preview and explicit save confirmation.
- [x] Optimistic file-change protection and advanced key preservation.
- [ ] Additional complex-file fixtures and UI-focused regression coverage (#43).
