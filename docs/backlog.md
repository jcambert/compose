# Product Backlog

## Product vision

`compose` is a professional CLI for developers who already have Docker Compose projects and want to discover, inspect, operate and diagnose them from a clean terminal workflow.

The primary product remains the CLI. The GUI is an optional local interface launched by the CLI, not a replacement product.

## Scope

### In scope

- Recursive discovery of Docker Compose projects.
- Interactive terminal browsing of stacks and services.
- Runtime status visibility.
- Workspaces, favorites and recent stacks for daily usage.
- Safe Docker Compose command generation and execution.
- Guided command option selection.
- Diagnostics through `compose doctor`.
- Stable JSON outputs and reusable application services.
- Optional local GUI launched by `compose ui`.
- Local UI runtime and log streaming through Server-Sent Events.

### Out of immediate scope

- Template catalog generation.
- Remote multi-user server.
- Desktop packaging with Electron or Tauri.
- Reimplementing Docker Compose behaviour.
- A GUI-specific command model.

Templates can be reconsidered later, but they are not part of the immediate roadmap because they shift the product from operating existing stacks to generating new stacks.

## Completed foundation

The following capabilities are already implemented or release-hardened:

- npm binary named `compose`.
- TypeScript CLI foundation.
- Recursive Compose file discovery.
- Compose YAML parsing and validation.
- Docker Compose command builder and executor.
- Project creation and service mutation primitives.
- Guided command mode.
- Interactive stack browser.
- Runtime status display.
- Workspaces, favorites and recent stacks.
- Expanded Docker Compose command surface.
- Browser access to the expanded command surface.
- `compose doctor` diagnostics.
- Smoke tests and npm pack dry-run.
- Release workflow with npm Trusted Publishing.
- Post-publication npm install verification.
- GUI roadmap and CLI-first product backlog.
- Reusable application service layer.
- Hardened doctor installation, PATH, npm and version diagnostics.
- Local config export, import, path and reset commands.
- Local UI server command through `compose ui`.
- React GUI MVP for diagnostics, workspaces, stacks, runtime status and command preview/execution.
- Browser filtering and sorting for large stack lists.
- Scanner exclusions and traversal limits for large source roots.
- Local UI rendering regression fix for invalid generated JavaScript.
- Bundled local GUI assets.
- Professional local UI layout.
- Workspace management from the UI.
- Polished workspace management UI.
- Read-only GUI streaming for runtime updates and logs.
- Live streams panel UX fixes for close, selected stack synchronization and themed scrollbars.

## Priority backlog

### P0 — Product and GUI roadmap

Status: completed in PR #19.

### P1 — Reusable application services

Status: completed in PR #20.

### P1 — Doctor hardening

Status: completed in PR #21.

### P1 — Configuration management

Status: completed in PR #22.

### P1 — Local UI server command

Status: completed in PR #23.

### P2 — React GUI MVP

Status: completed in PR #24, with rendering regression fixed in PR #27.

### P2 — Browser usability

Status: completed in PR #25.

### P2 — Scanner hardening

Status: completed in PR #26.

### P2 — Release readiness for v0.2.0

Status: completed in PR #28 and PR #29.

### P2 — GUI asset pipeline

Status: completed in PR #30.

### P2 — Professional local UI layout

Status: completed in PR #31.

### P2 — Local UI workspace management

Status: completed in PR #32 and polished in PR #33.

### P3 — GUI streaming

#### User story P3.1

As a developer, I can watch logs and runtime status updates from the optional local GUI.

Delivered behaviours:

- Server-Sent Events endpoint for selected stack runtime status updates.
- Server-Sent Events endpoint for selected stack/service log output.
- Browser live streams panel available from `compose ui`.
- Runtime stream updates selected stack state without manual refresh.
- Streaming stays local-only, token-protected and read-only.
- Log streams stop when the browser closes the stream or the user presses Stop.
- The live streams panel can be closed explicitly and with `Escape`.
- The live streams panel follows the stack selected in the Stacks view.
- Changing the selected stack clears stale stream output and stops previous streams.
- Scrollable stack and live-output panels use themed scrollbars.

Acceptance criteria:

- Logs can be streamed without refreshing the page.
- Runtime status can update in the GUI.
- The implementation remains local-only and token-protected.
- The live streams panel can be closed without leaving stale streams running.
- The panel does not mix output from different selected stacks.

Status: runtime/log streaming completed in PR #34; UX polish completed in PR #35.

### P3 — Docker Compose error reporting

#### User story P3.2

As a developer, I can understand Docker Compose command failures without digging through raw process output first.

Tasks:

- Normalize common Docker CLI and Docker Compose failures.
- Surface working directory, compose file path, command and exit code consistently.
- Keep raw stdout/stderr available for troubleshooting.
- Reuse the same error model from CLI and local UI.

Acceptance criteria:

- Command failures are easier to read in terminal and GUI flows.
- The typed result model remains compatible with current command execution.
- Tests cover at least missing Docker, missing Compose file and non-zero command failure cases.

Candidate PR: `feat: improve Docker Compose error reporting`.

### P3 — Templates, to revalidate later

#### User story P3.3

As a developer, I might want to generate new Compose stacks from templates, but only if this does not compromise the product focus.

Current decision:

- Do not prioritize templates now.
- Avoid maintaining a large catalog of Docker images and stack variations.
- Revisit only after CLI and optional GUI workflows are stable.

Acceptance criteria for future reconsideration:

- The feature must remain optional.
- The implementation must be declarative and low-maintenance.
- The project must not become primarily a Docker Compose template catalog.

## Recommended next PR order

```text
#36 feat: improve Docker Compose error reporting
#37 release: prepare v0.2.1
```

## Definition of done

Every backlog item is complete only when:

- Code or documentation is implemented.
- Tests cover the behaviour when code changes.
- Related docs are updated.
- CI is green.
- The PR is reviewed before merge.
