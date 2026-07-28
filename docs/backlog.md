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
- Bundled local React UI assets served from the npm package.
- Professional local UI layout with dashboard, sidebar, stack detail and command workflow.
- Workspace management from the local UI: create, edit path, select current and confirmed remove.

## Completed backlog items

### P0 — Product and GUI roadmap

#### User story P0.1

As a maintainer, I want a documented product backlog and GUI roadmap so future work stays aligned with the original CLI-first direction.

Status: completed in PR #19.

### P1 — Reusable application services

#### User story P1.1

As a future GUI developer, I can call reusable application services instead of duplicating CLI logic.

Acceptance criteria:

- CLI commands delegate to reusable application services.
- Application services do not import Commander or Inquirer.
- A future GUI can scan projects, read diagnostics, manage workspaces and preview commands through the same service layer.
- Existing CLI behaviour is preserved.

Status: completed in PR #20.

### P1 — Doctor hardening

#### User story P1.2

As a developer, I can run `compose doctor` to understand whether my local installation, PATH, Docker setup and workspace configuration are usable.

Acceptance criteria:

- `compose doctor` helps diagnose command-not-found and PATH issues on Windows.
- `compose doctor --json` returns a stable diagnostic model.
- `compose doctor --skip-docker` remains usable in CI.

Status: completed in PR #21.

### P1 — Configuration management

#### User story P1.3

As a developer, I can inspect, export and restore my local `compose` configuration.

Acceptance criteria:

- A user can locate the config file without knowing platform paths.
- A user can back up and restore workspaces/favorites.
- Invalid imported config is rejected safely.
- JSON output can be reused by the future GUI.

Status: completed in PR #22.

### P1 — Local UI server command

#### User story P1.4

As a developer, I can start an optional local GUI from the CLI without changing how the CLI works.

Acceptance criteria:

- `compose ui` starts a local server without requiring Docker to be running.
- The server can be integration-tested without opening a browser.
- API endpoints call reusable application services.
- Destructive command execution requires explicit confirmation data.

Status: completed in PR #23.

### P2 — React GUI MVP

#### User story P2.1

As a developer, I can use an optional local web UI to inspect workspaces, stacks, services, diagnostics and safe command previews.

Acceptance criteria:

- CLI installation remains the primary distribution path.
- The GUI is launched by the CLI.
- The GUI displays generated Docker Compose commands before meaningful execution.
- The GUI reuses application services through the local API.
- The CLI remains fully usable without the GUI.
- The root page does not render as a blank page when React startup fails.

Status: completed in PR #24, with rendering regression fixed in PR #27.

### P2 — Browser usability

#### User story P2.2

As a developer with many stacks, I can filter, sort and navigate the terminal browser efficiently.

Acceptance criteria:

- Large workspaces remain navigable.
- The user can quickly find a stack by name, path, service or runtime text.
- Runtime status sorting makes operational state easier to inspect.

Status: completed in PR #25.

### P2 — Scanner hardening

#### User story P2.3

As a developer, I can scan large source folders without wasting time in noisy directories.

Acceptance criteria:

- Large source roots scan faster.
- The scanner fails fast with a clear error when traversal limits are exceeded.
- JSON output remains compatible, with scan warnings kept off stdout.

Status: completed in PR #26.

### P2 — Release readiness for v0.2.0

#### User story P2.4

As a maintainer, I can prepare a clean v0.2.0 release from the stabilized UI, browser and scanner milestones.

Acceptance criteria:

- `docs/release-readiness.md` defines what must be checked before v0.2.0.
- The release scope and known limitations are explicit.
- Release notes are prepared separately from implementation PRs.

Status: completed in PR #28 and PR #29.

### P2 — GUI asset pipeline

#### User story P2.5

As a maintainer, I can package the React GUI as local bundled assets when the MVP API and UX contract are stable.

Acceptance criteria:

- `compose ui` can run the GUI without relying on browser ESM imports.
- The package still installs through npm as a CLI-first tool.
- The GUI build does not rewrite the command model.

Status: completed in PR #30.

### P2 — Professional local UI layout

#### User story P2.6

As a developer, I can use a more professional local UI that clearly separates dashboard, workspaces, stacks, diagnostics and command execution.

Acceptance criteria:

- The GUI is easier to understand on first launch.
- The CLI remains fully usable without the GUI.
- The local API contract remains compatible.

Status: completed in PR #31.

### P2 — Workspace management from local UI

#### User story P2.7

As a developer, I can manage saved source roots without leaving the local UI.

Acceptance criteria:

- Workspace mutations use the same local user config as the CLI.
- Stacks refresh after workspace changes.
- Command state is reset after switching workspace.
- Mutations remain token-protected and local-only.

Status: completed in PR #32.

### P2 — Workspace management UX polish

#### User story P2.8

As a developer, I can understand and safely manage workspaces from a polished UI.

Acceptance criteria:

- Current workspace is visually obvious.
- Remove actions require a second click.
- The UI supports updating an existing workspace path.
- The local API and CLI behaviour remain compatible.

Status: completed in PR #33.

## Priority backlog

### P3 — GUI streaming

#### User story P3.1

As a developer, I can watch logs and runtime status updates from the optional local GUI.

Tasks:

- Add Server-Sent Events endpoint for runtime status updates.
- Add Server-Sent Events endpoint for logs.
- Keep command execution and streaming cancellable where possible.
- Avoid WebSocket until bidirectional interaction is required.

Acceptance criteria:

- Logs can be streamed without refreshing the page.
- Runtime status can update in the GUI.
- The implementation remains local-only and token-protected.

Candidate PR: `feat: add GUI logs and runtime streaming`.

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
#34 feat: add GUI logs and runtime streaming
#35 feat: improve Docker Compose error reporting
#36 release: prepare next post-0.2.0 version
```

## Definition of done

Every backlog item is complete only when:

- Code or documentation is implemented.
- Tests cover the behaviour when code changes.
- Related docs are updated.
- CI is green.
- The PR is reviewed before merge.
