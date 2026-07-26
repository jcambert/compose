# Product Backlog

## Epic 1 — CLI foundation

### User story 1.1

As a developer, I can install the package and run `compose --help`.

Tasks:

- Initialise TypeScript project.
- Configure npm binary `compose`.
- Configure lint, typecheck and test scripts.
- Add CI workflow.
- Document local development.

Acceptance criteria:

- `npm run build` succeeds.
- `compose --help` works after `npm link`.
- CI runs lint, typecheck, tests and build.

## Epic 2 — Compose discovery

### User story 2.1

As a developer, I can recursively discover Compose files from any root directory.

Tasks:

- Implement recursive scanner.
- Detect `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, `compose.yaml`.
- Exclude noisy directories.
- Return absolute paths.
- Parse service names when possible.

Acceptance criteria:

- Nested fixtures are discovered at any depth.
- Invalid YAML does not hide the project; it appears with a warning.
- JSON output is available.

## Epic 3 — Docker Compose execution

### User story 3.1

As a developer, I can run common Docker Compose commands through `compose`.

Tasks:

- Implement command request model.
- Implement command builder.
- Support `up`, `down`, `ps`, `logs`, `build`, `pull`, `restart`, `exec`, `run`.
- Add dry-run mode.
- Add tests for generated commands.

Acceptance criteria:

- `compose up --project ./infra -d` generates `docker compose -f <file> up -d`.
- `compose exec` and `compose run` preserve passthrough command arguments.
- Dry-run never starts Docker.

## Epic 4 — Project management

### User story 4.1

As a developer, I can create and update a Compose project safely.

Tasks:

- Implement standard project factory.
- Implement add/remove/update service mutations.
- Validate YAML before write.
- Write project commands.

Acceptance criteria:

- `compose project init ./stack` creates a valid `compose.yaml`.
- `compose project add-service api --image node:22-alpine` adds a service.
- Invalid service names are rejected.

## Epic 5 — Quality and hardening

### User story 5.1

As a maintainer, I can trust changes because tests and docs are updated continuously.

Tasks:

- Increase coverage thresholds until 100% on core modules.
- Add integration tests for project mutation.
- Add Docker availability check.
- Add release dry-run.
- Maintain docs at task end.

Acceptance criteria:

- CI remains green before merge.
- Coverage trend is visible.
- Documentation matches implemented command behaviour.

## Epic 6 — Guided command mode and GUI readiness

### User story 6.1

As a developer, I can ask `compose` to guide me through command options before executing Docker Compose.

Tasks:

- Add `--guided`, `--yes` and `--no-interactive` global behaviours.
- Define command descriptors and option descriptors for Compose commands.
- Add prompt plans for `up`, `down`, `logs`, `build`, `run` and `exec`.
- Add confirmation prompts for destructive options such as `down --volumes`.
- Ensure guided answers resolve to the same `ComposeExecutionRequest` model as explicit flags.
- Add tests for guided option resolution without relying on terminal input.
- Update CLI examples and command documentation.

Acceptance criteria:

- `compose up --guided` asks whether detached mode should be enabled.
- `compose down --guided` clearly marks volume removal as destructive.
- `compose logs --guided` can ask whether logs should be followed and how many lines should be shown.
- `compose --no-interactive` never prompts and fails clearly when required data is missing.
- `compose --dry-run --guided` previews the final resolved command.

### User story 6.2

As a future GUI developer, I can build forms on top of the same descriptors and application services used by the CLI.

Tasks:

- Keep command descriptors UI-neutral.
- Keep prompt adapters separate from command building and execution.
- Expose reusable command metadata for documentation and GUI rendering.
- Avoid terminal-specific business rules inside application services.
- Add architectural documentation for GUI readiness.

Acceptance criteria:

- A GUI can render command forms without parsing CLI help output.
- A GUI can create a `ComposeExecutionRequest` without invoking Commander.
- Tests can validate guided flows by passing fake answers into the resolver.
