# Compose

`compose` is a professional Node.js CLI for discovering, browsing, validating and executing Docker Compose projects from a clean terminal workflow.

The command is intentionally named `compose`, because the fact that it is a CLI is already implicit.

## Goals

- Discover every Docker Compose file recursively from a root directory.
- Detect `docker-compose.yml`, `docker-compose.yaml`, `compose.yml` and `compose.yaml` at any depth.
- List discovered projects with absolute paths and service names.
- Browse discovered stacks and services interactively.
- Display live stack and service runtime status in the browser.
- Persist named workspaces, favorites and recent stacks for daily usage.
- Execute Docker Compose commands through a reliable command builder.
- Guide humans through command options with `--guided`.
- Diagnose local setup with `compose doctor`.
- Keep the codebase modular, testable and distributable through npm.
- Keep command descriptors UI-neutral so a future GUI can reuse them.

## Installation

The package is available for global npm installation:

```bash
npm install -g @jc90100/compose
compose --version
compose --help
compose doctor
```

During development, use the repository checkout:

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
compose browse
```

Use `compose doctor --skip-docker` for CI or smoke-test environments where Docker is intentionally unavailable.

## Command examples

```bash
compose workspace add dev C:\Sources
compose workspace use dev
compose workspace current
compose workspace list
compose browse
compose favorites add infra
compose favorites list

compose scan .
compose scan C:\Sources --json
compose select .
compose browse .
compose stacks C:\Sources --max-depth 6 --dry-run

compose up --project ./infra --detach
compose up --project ./infra --guided
compose up --project ./infra --guided --yes --dry-run
compose down --project ./infra --guided
compose down --project ./infra --remove-orphans
compose ps --project ./infra
compose logs --project ./infra --guided
compose logs --project ./infra --follow --tail 200
compose build --project ./infra --guided
compose build --project ./infra --no-cache
compose pull --project ./infra
compose restart --project ./infra api
compose kill --project ./infra api --signal SIGTERM
compose rm --project ./infra api --force --stop
compose config --project ./infra --services
compose cp --project ./infra api:/tmp/file.txt ./file.txt
compose version --project ./infra --short
compose exec --project ./infra --guided
compose exec --project ./infra api sh
compose run --project ./infra --guided
compose run --project ./infra --rm worker npm run migrate

compose project init ./my-stack --name my-stack
compose project add-service api --project ./my-stack --image node:22-alpine --port 3000:3000
compose project remove-service api --project ./my-stack
compose project validate --project ./my-stack
```

## Diagnostics

`compose doctor` checks the local runtime before daily usage or before opening an issue.

It verifies:

- Node.js `20.19.0+`
- Docker CLI availability
- `docker compose version`
- access to the local user config path
- current workspace configuration

Examples:

```bash
compose doctor
compose doctor --json
compose doctor --strict
compose doctor --skip-docker
```

Standard mode returns a non-zero exit code for errors. Warnings, such as no current workspace, are shown but do not fail the command. Strict mode treats warnings as failures.

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

Favorite commands:

```bash
compose favorites add infra
compose favorites remove infra
compose favorites list
```

Favorites are scoped to the current workspace and are stored in the local user config file:

- Windows: `%APPDATA%\compose\config.json`
- Linux/macOS: `~/.config/compose/config.json`

In the browser, favorites are displayed first and marked with a star:

```text
★ 1. infra           4 services · 3 running · 1 stopped · infra/compose.yaml
◐ 2. monitoring      2 services · 1 running · 1 stopped · monitoring/compose.yml
```

## Interactive stack browser

Use `compose browse` when you want to scan a root directory and navigate stacks and services from menus instead of typing each command.

```bash
compose browse
compose browse .
compose browse C:\Sources --max-depth 8
compose stacks . --dry-run
```

The browser is menu-first and designed for day-to-day terminal usage. It reads live state with `docker compose ps --format json` and falls back cleanly when Docker is unavailable.

```text
╭─ Compose Browser ──────────────────────────────────────────────
│ Root: C:\Sources
│ Workspace: dev
│ Stacks: 3
│ Runtime: 1 running · 1 partial · 1 stopped · 0 unavailable
│ Mode: execute commands
│ Navigate with arrows, press Enter to select.
╰──────────────────────────────────────────────────────────────────
? Select a stack
  ★ 1. infra           4 services · 4 running · 0 stopped · infra/compose.yaml
  ◐ 2. monitoring      2 services · 1 running · 1 stopped · monitoring/compose.yml
  ↻ Refresh            rafraîchir les statuts runtime
  ✕ Quit               fermer le browser
```

Stack and service menus include runtime context before asking for an action. Actions are grouped as inspect, lifecycle, tools and danger-zone operations.

The browser lets you:

- inspect containers with `ps`, `top`, `images`, `config` and `version`
- start, create, build, stop, restart, pause and unpause stacks or services
- show stack or service logs with a safe default tail
- run `port <service> <private-port>` through a prompt
- run `cp <source> <target>` through a prompt
- open a service shell with `exec <service> sh`
- run destructive `down`, `kill` and `rm` only after explicit confirmation

`--dry-run` prints the generated Docker command without executing it and does not call Docker for runtime status.

## Guided mode

Use `--guided` when you want `compose` to ask useful questions before executing a Docker Compose command.

```bash
compose up --project ./infra --guided
compose rm --project ./infra --guided
compose port --project ./infra --guided
```

Use `--guided --yes` to accept safe guided defaults without prompts, and combine with `--dry-run` to preview the final Docker command.

```bash
compose up --project ./infra --guided --yes --dry-run
```

## Technical stack

- Node.js 20.19+
- TypeScript
- Commander for explicit command composition
- `@inquirer/prompts` for interactive flows
- `yaml` for Compose YAML parsing and writing
- Zod for internal validation
- Execa for controlled `docker compose` execution
- Vitest for unit and integration tests
- GitHub Actions for CI/CD and release validation

## Repository structure

```text
src/
  cli/          terminal entrypoint, command registration and terminal adapters
  compose/      Docker Compose command building and execution
  doctor/       local diagnostic checks
  guided/       UI-neutral guided command descriptors and option resolution
  interactive/  interactive stack and service browsing workflows
  project/      project creation and service mutation
  scanner/      recursive Compose file discovery
  workspace/    local workspaces, favorites and recent stack persistence
  yaml/         YAML parsing, validation and writing
docs/
  architecture.md
  cli-design.md
  compose-command-surface.md
  release.md
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

Run the release-readiness checks directly:

```bash
npm run build
npm run smoke
npm run pack:dry-run
```

When intentionally changing dependencies, update `package.json`, regenerate `package-lock.json`, and commit both files together.

For local CLI testing:

```bash
npm link
compose --help
compose doctor
compose workspace add dev C:\Sources
compose browse --dry-run
```

## Release discipline

The repository follows a branch-per-step workflow. Each change should update related documentation before merge, every PR must wait for CI/CD to be green, and `main` history is not rewritten.

See:

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/cli-design.md`](docs/cli-design.md)
- [`docs/compose-command-surface.md`](docs/compose-command-surface.md)
- [`docs/release.md`](docs/release.md)
- [`docs/testing-strategy.md`](docs/testing-strategy.md)
- [`docs/devops.md`](docs/devops.md)
