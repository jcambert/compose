# Testing Strategy

## Objective

The long-term objective is total coverage for core modules and strong integration coverage for CLI workflows.

The initial threshold is intentionally strict but realistic:

- Lines: 90%
- Statements: 90%
- Functions: 90%
- Branches: 85%

Thresholds should be raised toward 100% as the command surface stabilises.

## Coverage scope

Coverage includes executable core modules:

- `scanner`
- `compose`
- `doctor`
- `guided`
- `interactive`
- `project`
- `workspace`
- `yaml`
- `utils`

Coverage excludes CLI wiring and source files that only export TypeScript types. Those files do not contain executable behaviour and should not make the coverage report artificially fail.

Interactive stack browser workflows are covered with unit tests that inject fake prompt adapters, fake scan results, fake runtime status readers and fake Compose executors. This keeps menu logic testable without running Docker or requiring a terminal session.

Workspace store behaviour is covered with pure unit tests and temporary JSON config paths. CLI command wiring remains thin and is validated indirectly through the underlying workspace functions.

Doctor diagnostics are covered with fake command runners and temporary workspace stores so tests do not depend on Docker availability.

## Test categories

### Unit tests

Targets:

- Compose filename detection.
- Recursive scanning.
- YAML parsing.
- YAML validation.
- Service mutations.
- Compose command generation.
- Compose execution through injectable process runners.
- Doctor Node.js version validation.
- Doctor Docker and Docker Compose checks through injectable runners.
- Doctor config and workspace diagnostics.
- Guided command descriptors.
- Guided option resolution with fake prompt adapters.
- Guided safe defaults through `--guided --yes`.
- Guided contradiction handling through `--guided --no-interactive`.
- Interactive stack browser stack choices.
- Interactive stack browser request generation.
- Interactive stack and service action flows with fake prompts and fake execution.
- Browser favorite sorting and favorite toggle callbacks.
- Browser full command surface request generation for stack actions.
- Browser full command surface request generation for service actions.
- Browser prompts for `kill --signal`, `rm --force --stop --volumes`, `port` and `cp`.
- Browser destructive confirmation rejection for `down`, `kill` and `rm`.
- Runtime status command generation for `docker compose ps --format json`.
- Runtime status parsing for JSON array and newline-delimited JSON output.
- Runtime status fallback when Docker is unavailable.
- Runtime status dry-run behaviour that avoids Docker calls.
- Workspace add/remove/use/current behaviour.
- Workspace-scoped favorite add/remove/list behaviour.
- Recent stack de-duplication.
- Workspace config JSON load/save.
- Project creation and persistence.
- Filesystem utilities.
- Path resolution.

### Integration tests

Targets:

- Scan fixture trees.
- Create project in a temporary directory.
- Add and remove services.
- Validate generated YAML.
- Dry-run Compose execution.
- Guided dry-run command resolution without running Docker.
- Interactive browser dry-run command generation.
- Browser live-status rendering with fake runtime status readers.
- Browser full command surface dry-run previews for operational actions.
- Browse without root using a configured current workspace.

### CLI smoke tests

`npm run smoke` validates the built CLI entrypoint after `npm run build`.

The smoke test covers:

- `compose --help`
- `compose scan --help`
- `compose browse --help`
- `compose workspace --help`
- `compose doctor --help`
- `compose doctor --skip-docker`
- shebang preservation on `dist/cli/index.js`

The smoke test sets `COMPOSE_CONFIG_PATH` to a temporary path so it never mutates the developer or CI user config.

### Package tests

`npm run pack:dry-run` validates npm package contents without publishing.

This protects:

- `bin.compose`
- packaged `dist`
- packaged documentation
- `CHANGELOG.md`
- npm metadata

### Optional Docker tests

Docker-backed tests must be opt-in because CI runners and developer machines may not always have Docker available.

Recommended flag:

```bash
COMPOSE_E2E_DOCKER=1 npm test
```

Future Docker-backed browser tests should validate live `docker compose ps --format json` integration on a small fixture stack.

## Coverage discipline

New code should come with tests in the same PR. If a task modifies documentation-visible behaviour, examples must be updated in README and docs before merge.

A coverage failure must be fixed by adding meaningful tests first. Thresholds should only be changed when the project deliberately changes its coverage policy.

## Release readiness discipline

Every release candidate must pass:

```bash
npm ci
npm run validate
```

CI also runs smoke tests and `npm pack --dry-run` to catch packaging regressions before merge.

## Fixtures

Fixtures should cover:

- `docker-compose.yml`
- `docker-compose.yaml`
- `compose.yml`
- `compose.yaml`
- nested directories
- invalid YAML with warning behaviour
- services with `image`
- services with `build`
- ports, volumes, environment, networks and depends_on
