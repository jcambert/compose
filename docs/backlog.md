# Product Backlog

## Product vision

`compose` is a professional CLI for developers who already have Docker Compose projects and want to discover, inspect, operate and diagnose them from a clean terminal workflow.

The primary product remains the CLI. A future GUI is planned as an optional local interface launched by the CLI, not as a replacement product.

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

## Priority backlog

### P0 — Product and GUI roadmap

#### User story P0.1

As a maintainer, I want a documented product backlog and GUI roadmap so future work stays aligned with the original CLI-first direction.

Tasks:

- Document product boundaries.
- Document the GUI development strategy.
- Keep `compose` CLI-first.
- Define GUI as optional local UI launched by `compose ui`.
- Document initial GUI technology choices.
- Move templates to non-priority/future validation.

Acceptance criteria:

- `docs/backlog.md` states the product scope and priority order.
- `docs/gui-roadmap.md` states the GUI architecture, security posture and technology direction.
- The next implementation steps are explicit and ordered.

Status: completed in PR #19.

### P1 — Reusable application services

#### User story P1.1

As a future GUI developer, I can call reusable application services instead of duplicating CLI logic.

Tasks:

- Introduce `src/app` as the shared application service layer.
- Extract scan, doctor, workspace, favorite, command preview, command execution and project mutation use cases.
- Route CLI commands through application services.
- Keep Commander and Inquirer dependencies in the CLI adapter.
- Keep Docker Compose command generation in the existing `compose` module.
- Add direct tests for application services.

Acceptance criteria:

- CLI commands delegate to reusable application services.
- Application services do not import Commander or Inquirer.
- A future GUI can scan projects, read diagnostics, manage workspaces and preview commands through the same service layer.
- Existing CLI behaviour is preserved.

Status: completed in PR #20.

### P1 — Doctor hardening

#### User story P1.2

As a developer, I can run `compose doctor` to understand whether my local installation, PATH, Docker setup and workspace configuration are usable.

Tasks:

- Report the resolved `compose` executable path when possible.
- Report CLI version.
- Report Node.js version.
- Report Docker CLI and Docker Compose availability.
- Report npm global prefix when useful.
- Warn when the npm global prefix is likely missing from PATH.
- Keep `--json` stable enough for future GUI usage.
- Keep `--strict` behaviour for warnings-as-failures.

Acceptance criteria:

- `compose doctor` helps diagnose command-not-found and PATH issues on Windows.
- `compose doctor --json` returns a stable diagnostic model.
- `compose doctor --skip-docker` remains usable in CI.

Status: completed in PR #21.

### P1 — Configuration management

#### User story P1.3

As a developer, I can inspect, export and restore my local `compose` configuration.

Tasks:

- Add `compose config path`.
- Add `compose config export`.
- Add `compose config import`.
- Add `compose config reset` with confirmation.
- Validate imported config.
- Keep workspace/favorite/recent stack data compatible.

Acceptance criteria:

- A user can locate the config file without knowing platform paths.
- A user can back up and restore workspaces/favorites.
- Invalid imported config is rejected safely.
- JSON output can be reused by the future GUI.

Status: completed in PR #22.

### P1 — Local UI server command

#### User story P1.4

As a developer, I can start an optional local GUI from the CLI without changing how the CLI works.

Tasks:

- Add `compose ui`.
- Start a local-only HTTP server.
- Bind to `127.0.0.1` by default.
- Use a dynamic port by default.
- Generate a short-lived local token.
- Add `--port`, `--workspace` and `--no-open` options.
- Expose initial JSON endpoints for doctor, workspaces, stacks and command previews.

Acceptance criteria:

- `compose ui` starts a local server without requiring Docker to be running.
- The server can be integration-tested without opening a browser.
- API endpoints call reusable application services.
- Destructive command execution requires explicit confirmation data.

Status: completed in PR #23.

### P2 — React GUI MVP

#### User story P2.1

As a developer, I can use an optional local web UI to inspect workspaces, stacks, services, diagnostics and safe command previews.

Tasks:

- Add React UI shell served by `compose ui`.
- Add Doctor screen.
- Add Workspaces screen.
- Add Stacks screen.
- Add Stack detail and service list.
- Add command preview and execution result display.
- Confirm destructive actions visibly.

Acceptance criteria:

- CLI installation remains the primary distribution path.
- The GUI is launched by the CLI.
- The GUI displays generated Docker Compose commands before meaningful execution.
- The GUI reuses application services through the local API.
- The CLI remains fully usable without the GUI.

Status: in progress through PR #24.

### P2 — Browser usability

#### User story P2.2

As a developer with many stacks, I can filter, sort and navigate the terminal browser efficiently.

Tasks:

- Add filtering in stack selection.
- Sort by favorites, recents and runtime status.
- Improve unavailable/error status display.
- Keep refresh actions clear.
- Improve large-directory usability.

Acceptance criteria:

- Large workspaces remain navigable.
- The user can quickly find a stack by name or relative path.
- Runtime status sorting makes operational state obvious.

Candidate PR: `feat: improve browser filtering and sorting`.

### P2 — GUI asset pipeline

#### User story P2.3

As a maintainer, I can package the React GUI as local bundled assets when the MVP API and UX contract are stable.

Tasks:

- Add a dedicated GUI build pipeline.
- Package browser assets under `dist` for npm distribution.
- Keep the API contract compatible with the MVP.
- Keep CLI builds and smoke tests fast.

Acceptance criteria:

- `compose ui` can run the GUI without relying on browser ESM imports.
- The package still installs through npm as a CLI-first tool.
- The GUI build does not rewrite the command model.

Candidate PR: `build: bundle local GUI assets`.

### P2 — Scanner hardening

#### User story P2.4

As a developer, I can scan large source folders without wasting time in noisy directories.

Tasks:

- Exclude common noisy folders by default: `.git`, `node_modules`, `bin`, `obj`, `dist`, build outputs and package caches.
- Allow explicit include/exclude configuration later.
- Improve warnings for invalid Compose YAML.
- Keep scan output stable for CLI and GUI usage.

Acceptance criteria:

- Large source roots scan faster.
- Invalid Compose files are visible with useful warnings.
- JSON output remains compatible.

Candidate PR: `perf: harden scanner exclusions`.

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

### P3 — Templates, to revalidate later

#### User story P3.2

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
#19 docs: formalize GUI roadmap and product backlog
#20 refactor: formalize reusable application services
#21 feat: harden doctor diagnostics
#22 feat: add config export and import
#23 feat: add local UI server command
#24 feat: add React GUI MVP
#25 build: bundle local GUI assets
#26 feat: improve browser filtering and sorting
#27 perf: harden scanner exclusions
```

## Definition of done

Every backlog item is complete only when:

- Code or documentation is implemented.
- Tests cover the behaviour when code changes.
- Related docs are updated.
- CI is green.
- The PR is reviewed before merge.
