# Product Backlog

## Product vision

`compose` is a professional CLI for developers who already have Docker Compose projects and want to discover, inspect, operate, edit and diagnose them from a clean workflow.

The primary product remains the CLI. The GUI is an optional local interface launched by the CLI, not a replacement product.

## Scope

### In scope

- Recursive discovery of Docker Compose projects.
- Interactive terminal browsing of stacks and services.
- Runtime status visibility.
- Workspaces, favorites and recent stacks for daily usage.
- Safe Docker Compose command generation and execution.
- Guided command option selection.
- Diagnostics through `compose doctor` and structured command failure reporting.
- Stable JSON outputs and reusable application services.
- Optional local GUI launched by `compose ui`.
- Local UI runtime and log streaming through Server-Sent Events.
- Guided Compose file editing for users who are not Docker Compose YAML specialists.
- Safe creation, update and deletion of service definitions inside Compose YAML files.

### Out of immediate scope

- Template catalog generation.
- Remote multi-user server.
- Desktop packaging with Electron or Tauri.
- Reimplementing Docker Compose behaviour.
- A GUI-specific command model.
- A raw YAML editor as the only Compose editing experience.

Templates can be reconsidered later, but they are not part of the immediate roadmap because they shift the product from operating and editing existing stacks to generating new stack catalogs.

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
- Structured Docker Compose command failure diagnostics.
- `v0.2.1` release preparation metadata.
- Repository `AGENTS.md` contributor and agent guidelines.
- `v0.2.2` patch release preparation metadata.
- Simplified Compose YAML editing design.

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
- The launcher is hidden while the Live streams panel is already open.

Acceptance criteria:

- Logs can be streamed without refreshing the page.
- Runtime status can update in the GUI.
- The implementation remains local-only and token-protected.
- The live streams panel can be closed without leaving stale streams running.
- The panel does not mix output from different selected stacks.

Status: runtime/log streaming completed in PR #34; UX polish completed in PR #35 and PR #38.

### P3 — Docker Compose error reporting

#### User story P3.2

As a developer, I can understand Docker Compose command failures without digging through raw process output first.

Delivered behaviours:

- Normalized failure kinds for unavailable Docker, missing Compose files and generic non-zero Docker Compose failures.
- Diagnostic object attached to failed execution results.
- Generated command, working directory, Compose file path and exit code surfaced consistently.
- Raw stdout/stderr preserved on the diagnostic for troubleshooting.
- Terminal execution with the default Docker runner prints an actionable diagnostic summary.
- Local UI command execution receives the same typed execution result and diagnostic model.

Acceptance criteria:

- Command failures are easier to read in terminal and GUI flows.
- The typed result model remains compatible with current command execution.
- Tests cover at least missing Docker, missing Compose file and non-zero command failure cases.

Status: completed in PR #36.

### P3 — Release v0.2.1

Status: release metadata prepared in PR #37 and published manually afterwards.

### P3 — Release v0.2.2

Status: release metadata prepared in PR #39. Publishing remains an explicit manual release workflow step after merge.

### P4 — Simplified Compose YAML editing

#### User story P4.1

As a user who is not a Docker Compose YAML specialist, I can create, edit and delete service definitions from an existing stack through guided forms instead of editing raw YAML manually.

Planned behaviours:

- Read the selected stack's Compose YAML file through the existing Compose document layer.
- Show services in an editable, user-friendly model.
- Create a new service with guided fields for image/build, ports, environment, volumes, dependencies, restart policy and command.
- Edit common service fields without requiring raw YAML knowledge.
- Delete a service only after explicit confirmation.
- Preview the YAML diff before writing changes.
- Validate the resulting Compose document before saving.
- Preserve unsupported or advanced YAML sections instead of silently dropping them.
- Keep all file writes local-only and token-protected in `compose ui`.
- Prefer safe, targeted document mutations over full file regeneration.

Acceptance criteria:

- A non-specialist can add a basic service from the UI.
- A non-specialist can modify image, ports, environment and volumes for an existing service.
- A non-specialist can delete a service with confirmation.
- The tool shows what will change before writing the file.
- Invalid Compose YAML is rejected with a clear diagnostic.
- Existing unsupported keys are preserved unless the user explicitly removes them.
- CLI workflows remain available and the GUI does not create a separate configuration model.

Status: design completed in PR #40. Implementation starts in PR #41.

### P4 — Templates, to revalidate later

#### User story P4.2

As a developer, I might want to generate new Compose stacks from templates, but only if this does not compromise the product focus.

Current decision:

- Do not prioritize templates now.
- Avoid maintaining a large catalog of Docker images and stack variations.
- Revisit only after CLI, optional GUI and guided Compose editing workflows are stable.

Acceptance criteria for future reconsideration:

- The feature must remain optional.
- The implementation must be declarative and low-maintenance.
- The project must not become primarily a Docker Compose template catalog.

## Recommended next PR order

```text
#39 release: prepare v0.2.2
#40 docs: design simplified Compose YAML editing (completed)
#41 feat: add Compose document editing service (completed)
#43 feat: expose guided service editing in local UI (completed)
#44 test: validate installed CLI and UI editing on Windows with real Docker stacks (completed)
```

## Definition of done

Every backlog item is complete only when:

- Code or documentation is implemented.
- Tests cover the behaviour when code changes.
- Related docs are updated.
- CI is green.
- The PR is reviewed before merge.

## Completed: guided Compose service editing (#43)

The local React UI now exposes the #41 editing engine through stack-scoped endpoints and guided create, update and delete workflows. Every mutation requires a generated YAML diff and explicit confirmation before disk write. Windows, installed-package and complex fixture hardening is completed in PR #44.


## Completed: Windows and real-stack hardening (#44)

The installed npm package is exercised from an isolated prefix on Windows-compatible paths. Realistic fixtures verify that guided mutations preserve advanced Compose sections, handle LF and CRLF input, and reject stale previews. A dedicated Windows GitHub Actions workflow validates the editing flow, build, smoke test and installed package.
