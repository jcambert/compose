# Compose

`compose` is a professional Node.js CLI for discovering, managing, validating and executing Docker Compose projects from a clean terminal workflow.

The command is intentionally named `compose`, because the fact that it is a CLI is already implicit.

## Goals

- Discover every Docker Compose file recursively from a root directory.
- Detect `docker-compose.yml`, `docker-compose.yaml`, `compose.yml` and `compose.yaml` at any depth.
- List discovered projects with absolute paths and service names.
- Select a project interactively.
- Execute Docker Compose commands through a reliable command builder.
- Guide humans through command options with `--guided`.
- Create and maintain Compose project files with typed YAML validation.
- Keep the codebase modular, testable and distributable through npm.
- Keep command descriptors UI-neutral so a future GUI can reuse them.

## Command examples

```bash
compose scan .
compose scan C:\Sources --json
compose select .

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
  cli/       terminal entrypoint, command registration and terminal adapters
  guided/    UI-neutral guided command descriptors and option resolution
  scanner/   recursive Compose file discovery
  compose/   Docker Compose command building and execution
  project/   project creation and service mutation
  yaml/      YAML parsing, validation and writing
  utils/     common filesystem, path, error and logging helpers
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

```bash
npm install
npm run build
npm test
npm run lint
npm run audit
npm run validate
```

For local CLI testing:

```bash
npm link
compose --help
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
