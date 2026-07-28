# Compose

`compose` is a professional Node.js CLI for discovering, browsing, validating and executing Docker Compose projects from a clean terminal workflow.

The command is intentionally named `compose`, because the fact that it is a CLI is already implicit. The primary product remains the CLI. The browser UI is optional, local-only and launched by the CLI through `compose ui`.

## Goals

- Discover Docker Compose files recursively from a root directory.
- Detect `docker-compose.yml`, `docker-compose.yaml`, `compose.yml` and `compose.yaml` at any depth.
- Keep large workspace scans practical with default exclusions and traversal guard rails.
- Persist named workspaces, favorites and recent stacks for daily usage.
- Browse discovered stacks and services interactively from the terminal.
- Filter and sort stack choices for large workspaces.
- Execute Docker Compose commands through a reliable command builder.
- Guide humans through command options with `--guided`.
- Diagnose local setup with `compose doctor`.
- Start an optional local browser UI with `compose ui` to manage workspaces, inspect stacks and preview commands.
- Keep command descriptors UI-neutral so CLI and GUI reuse the same application services.

## Installation

```bash
npm install -g @jc90100/compose
compose --version
compose --help
compose doctor
```

During development:

```bash
npm ci
npm run build
npm link
compose --help
```

## Quick start

```bash
compose doctor
compose workspace add dev C:\Sources
compose workspace use dev
compose browse --filter api --sort runtime
compose ui --workspace dev
```

Use `compose doctor --skip-docker` for CI or smoke-test environments where Docker is intentionally unavailable.

## Command examples

```bash
compose workspace add dev C:\Sources
compose workspace use dev
compose workspace current
compose workspace list
compose workspace remove dev

compose favorites add infra
compose favorites list
compose favorites remove infra

compose config path
compose config export --output compose-config.backup.json
compose config import compose-config.backup.json --yes
compose config reset --yes

compose scan .
compose scan C:\Sources --json
compose scan C:\Sources --exclude artifacts tmp-generated
compose scan C:\Sources --max-depth 6 --max-directories 100000 --max-entries 500000

compose browse
compose browse --filter api
compose browse --sort runtime
compose browse C:\Sources --filter monitoring --sort path
compose stacks C:\Sources --max-depth 6 --filter worker --sort services --dry-run

compose ui
compose ui --workspace dev
compose ui --port 0
compose ui --skip-docker --no-open

compose up --project ./infra --detach
compose up --project ./infra --guided
compose up --project ./infra --guided --yes --dry-run
compose down --project ./infra --guided
compose down --project ./infra --remove-orphans
compose ps --project ./infra
compose logs --project ./infra --follow --tail 200
compose build --project ./infra --no-cache
compose pull --project ./infra
compose restart --project ./infra api
compose kill --project ./infra api --signal SIGTERM
compose rm --project ./infra api --force --stop
compose config --project ./infra --services
compose exec --project ./infra api sh
compose run --project ./infra --rm worker npm run migrate

compose project init ./my-stack --name my-stack
compose project add-service api --project ./my-stack --image node:22-alpine --port 3000:3000
compose project remove-service api --project ./my-stack
compose project validate --project ./my-stack
```

## Diagnostics

`compose doctor` checks the local runtime and installation before daily usage or before opening an issue.

It verifies:

- installed `compose` CLI package version
- `compose` executable discovery through `PATH`
- npm global prefix resolution
- whether the npm global executable directory is present in `PATH`
- Node.js `20.19.0+`
- Docker CLI availability
- Docker Compose availability
- access to the local user config path
- current workspace configuration

Examples:

```bash
compose doctor
compose doctor --json
compose doctor --strict
compose doctor --skip-docker
```

Standard mode returns a non-zero exit code for errors. Warnings, such as no current workspace, skipped Docker checks or a missing npm global directory in `PATH`, are shown but do not fail the command. Strict mode treats warnings as failures.

On Windows, `compose doctor` helps diagnose the common case where `npm install -g @jc90100/compose` succeeded but PowerShell cannot find `compose` until the npm global prefix is added to `PATH` or the terminal is reopened.

## Configuration management

`compose` stores workspaces, favorites and recent stacks in a local user config file.

```bash
compose config path
compose config path --json
compose config export
compose config export --output compose-config.backup.json
compose config import compose-config.backup.json
compose config import compose-config.backup.json --yes
compose config reset
compose config reset --yes
```

`compose config` without a subcommand still delegates to `docker compose config` for the selected Compose project:

```bash
compose config --project ./infra --services
compose config --project ./infra --quiet
compose config --project ./infra --format json
```

See [`docs/config-management.md`](docs/config-management.md) for import validation and backup details.

## Workspaces and favorites

Use workspaces when you browse the same root directory often.

```bash
compose workspace add dev C:\Sources
compose workspace use dev
compose browse
```

When `compose browse` is called without a root argument, it uses the current workspace root. If no workspace is configured, it falls back to the current directory.

Workspace commands:

```bash
compose workspace add <name> <path>
compose workspace remove <name>
compose workspace use <name>
compose workspace list
compose workspace current
```

Favorites are scoped to the current workspace and are stored in the local user config file:

- Windows: `%APPDATA%\compose\config.json`
- Linux/macOS: `~/.config/compose/config.json`

## Interactive stack browser

Use `compose browse` when you want to scan a root directory and navigate stacks and services from menus instead of typing each command.

```bash
compose browse
compose browse .
compose browse C:\Sources --max-depth 8
compose browse C:\Sources --filter monitoring --sort path
compose browse --filter api --sort runtime
compose stacks . --dry-run
```

The browser is menu-first and designed for day-to-day terminal usage. It reads live state with `docker compose ps --format json` and falls back cleanly when Docker is unavailable.

Stack and service menus include runtime context before asking for an action. Actions are grouped as inspect, lifecycle, tools and danger-zone operations. Destructive `down`, `kill` and `rm` actions require explicit confirmation.

## Scanner performance

The scanner skips common generated, dependency-heavy and IDE directories by default, including `node_modules`, `.git`, `.cache`, `.next`, `.turbo`, `.terraform`, `.venv`, `dist`, `build`, `bin`, `obj` and `target`.

Additional machine-specific folders can be skipped with `--exclude`:

```bash
compose scan C:\Sources --exclude artifacts tmp-generated
compose scan C:\Sources --max-depth 6 --max-directories 100000 --max-entries 500000
compose scan C:\Sources --json --max-depth 5 > stacks.json
```

`compose scan --json` keeps JSON on stdout and writes scanner warnings to stderr so scripts can parse stdout safely.

See [`docs/scanner-performance.md`](docs/scanner-performance.md) for the detailed safety model.

## Local UI

`compose ui` starts an optional browser-based local interface from the CLI.

```bash
compose ui
compose ui --workspace dev
compose ui --port 0
compose ui --skip-docker --no-open
```

The local UI:

- binds to `127.0.0.1`
- uses a dynamic free port by default
- protects the browser session and API with a short-lived token
- serves bundled React assets locally from `dist/ui`
- shows doctor diagnostics, workspaces, stacks, runtime summaries and command previews
- manages saved workspaces from the browser: create, edit path, select current and remove with confirmation
- keeps the current workspace visually distinct and hides destructive removal behind an explicit confirmation
- requires explicit confirmation before command execution
- requires stronger confirmation for destructive commands such as `down`, `kill` and `rm`

The browser UI is built by `npm run build` and packaged with the npm CLI. The browser no longer needs to download React from an external CDN at runtime. In a source checkout where the UI assets are missing, `compose ui` returns a visible fallback page explaining that `npm run build` must be run.

Workspace management in the UI uses the same local user config as the CLI. Saving an existing workspace name updates its path, switching workspace refreshes the stack scan, and removing a workspace requires a visible confirmation step.

See [`docs/local-ui-server.md`](docs/local-ui-server.md) and [`docs/gui-roadmap.md`](docs/gui-roadmap.md) for details.

## Guided mode

Use `--guided` when you want `compose` to ask useful questions before executing a Docker Compose command.

```bash
compose up --project ./infra --guided
compose rm --project ./infra --guided
compose port --project ./infra --guided
compose up --project ./infra --guided --yes --dry-run
```

## Technical stack

- Node.js 20.19+
- TypeScript
- React for the optional local browser UI
- Vite for bundled local UI assets
- Commander for explicit command composition
- `@inquirer/prompts` for interactive flows
- `yaml` for Compose YAML parsing and writing
- Zod for internal validation
- Execa for controlled Docker Compose execution
- Vitest for unit and integration tests
- GitHub Actions for CI/CD and release validation

## Repository structure

```text
src/
  app/          reusable application services for CLI and GUI adapters
  cli/          terminal entrypoint, command registration and terminal adapters
  compose/      Docker Compose command building and execution
  doctor/       local diagnostic checks
  guided/       UI-neutral guided command descriptors and option resolution
  interactive/  interactive stack and service browsing workflows
  project/      project creation and service mutation
  scanner/      recursive Compose file discovery
  ui/           bundled React UI source for compose ui
  workspace/    local workspaces, favorites and recent stack persistence
  yaml/         YAML parsing, validation and writing
docs/
  architecture.md
  cli-design.md
  compose-command-surface.md
  config-management.md
  gui-roadmap.md
  local-ui-server.md
  browser-filtering-sorting.md
  scanner-performance.md
  release.md
  release-readiness.md
  backlog.md
  sprint-plan.md
  testing-strategy.md
  devops.md
  adr/
tests/
  unit/
  integration/
```

## Development

Install dependencies from the committed lockfile:

```bash
npm ci
```

Run validation locally:

```bash
npm run validate
```

Run release-readiness checks directly:

```bash
npm run build
npm run smoke
npm run pack:dry-run
```

For local CLI testing:

```bash
npm link
compose --help
compose doctor
compose workspace add dev C:\Sources
compose config path
compose browse --filter api --sort runtime --dry-run
compose ui --skip-docker --no-open
```

## Release discipline

The repository follows a branch-per-step workflow. Each change should update related documentation before merge, every PR must wait for CI/CD to be green, and `main` history is not rewritten.

See:

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/cli-design.md`](docs/cli-design.md)
- [`docs/compose-command-surface.md`](docs/compose-command-surface.md)
- [`docs/config-management.md`](docs/config-management.md)
- [`docs/local-ui-server.md`](docs/local-ui-server.md)
- [`docs/gui-roadmap.md`](docs/gui-roadmap.md)
- [`docs/backlog.md`](docs/backlog.md)
- [`docs/browser-filtering-sorting.md`](docs/browser-filtering-sorting.md)
- [`docs/scanner-performance.md`](docs/scanner-performance.md)
- [`docs/release.md`](docs/release.md)
- [`docs/release-readiness.md`](docs/release-readiness.md)
- [`docs/testing-strategy.md`](docs/testing-strategy.md)
- [`docs/devops.md`](docs/devops.md)
