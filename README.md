# Compose

`compose` is a professional Node.js CLI for discovering, managing, validating and executing Docker Compose projects from a clean terminal workflow.

The command is intentionally named `compose`, because the fact that it is a CLI is already implicit.

## Goals

- Discover every Docker Compose file recursively from a root directory.
- Detect `docker-compose.yml`, `docker-compose.yaml`, `compose.yml` and `compose.yaml` at any depth.
- List discovered projects with absolute paths and service names.
- Select a project interactively.
- Browse discovered stacks and services interactively.
- Display live stack and service runtime status in the browser.
- Persist named workspaces, favorites and recent stacks for daily usage.
- Execute Docker Compose commands through a reliable command builder.
- Guide humans through command options with `--guided`.
- Create and maintain Compose project files with typed YAML validation.
- Keep the codebase modular, testable and distributable through npm.
- Keep command descriptors UI-neutral so a future GUI can reuse them.

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
compose exec --project ./infra --guided
compose exec --project ./infra api sh
compose run --project ./infra --guided
compose run --project ./infra --rm worker npm run migrate

compose project init ./my-stack --name my-stack
compose project add-service api --project ./my-stack --image node:22-alpine --port 3000:3000
compose project remove-service api --project ./my-stack
compose project validate --project ./my-stack
```

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

Stack and service menus include runtime context before asking for an action:

```text
╭─ Services: infra ───────────────────────────────────────────────
│ File: infra/compose.yaml
│ Runtime: 3 running · 1 stopped
│ ● api                running · 1 container · 0.0.0.0:5000->80/tcp
│ ● db                 running · 1 container · 5432/tcp
│ ○ worker             stopped · 0 containers
╰──────────────────────────────────────────────────────────────────
```

The stack and service menus are grouped into inspect, lifecycle, tools and danger-zone actions:

```text
▦ [Inspect] Services        explorer les services de cette stack
★ [Inspect] Favorite        ajouter ou retirer des favoris
↻ [Inspect] Refresh         rafraîchir les statuts runtime
● [Inspect] Status          docker compose ps
⚙ [Inspect] Config          docker compose config
▣ [Inspect] Images          docker compose images
▤ [Inspect] Top             docker compose top
ℹ [Inspect] Version         docker compose version
▶ [Lifecycle] Up            docker compose up -d
◇ [Lifecycle] Create        docker compose create
◆ [Lifecycle] Build         docker compose build
▷ [Lifecycle] Start         docker compose start
■ [Lifecycle] Stop          docker compose stop
⏸ [Lifecycle] Pause         docker compose pause
▶ [Lifecycle] Unpause       docker compose unpause
↺ [Lifecycle] Restart       docker compose restart
◷ [Tools] Logs              docker compose logs --tail 100
🔌 [Tools] Port             docker compose port <service> <private-port>
📋 [Tools] Copy file        docker compose cp <source> <target>
☠ [Danger] Kill             docker compose kill
🗑 [Danger] Remove           docker compose rm
⚠ [Danger] Down             arrêter et retirer les conteneurs
```

The service browser exposes the same operational surface for one service, including pause, unpause, kill, remove, logs, top, port and shell.

The browser lets you:

- select a discovered stack from the scan result
- keep favorite stacks at the top of the list
- see running, stopped, unhealthy and unavailable runtime states
- refresh runtime status without leaving the menu
- inspect containers, images, config, top output and Compose version
- run lifecycle actions such as up, create, build, start, stop, pause, unpause and restart
- run tools such as logs, port lookup and file copy
- open a nested service browser
- open a shell with `docker compose exec <service> sh`

Destructive actions such as `down`, `kill` and `rm` require an explicit confirmation. `kill` prompts for an optional signal, `rm` prompts for `--force`, `--stop` and `--volumes`, `port` prompts for a private port, and `cp` prompts for source and target. `--dry-run` prints the generated Docker command without executing it and does not call Docker for runtime status.

## Guided mode

Use `--guided` when you want `compose` to ask useful questions before executing a Docker Compose command.

Example:

```bash
compose up --project ./infra --guided
```

Typical questions:

```text
Start containers in detached mode?
Build images before starting?
Remove orphan containers?
Scale services?
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
- GitHub Actions for CI/CD

## Repository structure

```text
src/
  cli/          terminal entrypoint, command registration and terminal adapters
  guided/       UI-neutral guided command descriptors and option resolution
  interactive/  interactive stack and service browsing workflows
  scanner/      recursive Compose file discovery
  compose/      Docker Compose command building and execution
  project/      project creation and service mutation
  workspace/    local workspaces, favorites and recent stack persistence
  yaml/         YAML parsing, validation and writing
  utils/        common filesystem, path, error and logging helpers
docs/
  architecture.md
  cli-design.md
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
npm run build
npm test
npm run lint
npm run audit
npm run validate
```

When intentionally changing dependencies, update `package.json`, regenerate `package-lock.json`, and commit both files together.

For local CLI testing:

```bash
npm link
compose --help
compose workspace add dev C:\Sources
compose browse --dry-run
```

## Delivery discipline

The project follows a branch-per-step workflow. Each change should update the related documentation before merge, and every merge must wait for CI/CD to be green.

See:

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/cli-design.md`](docs/cli-design.md)
- [`docs/backlog.md`](docs/backlog.md)
- [`docs/sprint-plan.md`](docs/sprint-plan.md)
- [`docs/testing-strategy.md`](docs/testing-strategy.md)
- [`docs/devops.md`](docs/devops.md)
