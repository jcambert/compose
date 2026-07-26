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
- `guided`
- `project`
- `yaml`
- `utils`

Coverage excludes CLI wiring and source files that only export TypeScript types. Those files do not contain executable behaviour and should not make the coverage report artificially fail.

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
- Guided command descriptors.
- Guided option resolution with fake prompt adapters.
- Guided safe defaults through `--guided --yes`.
- Guided contradiction handling through `--guided --no-interactive`.
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

### Optional Docker tests

Docker-backed tests must be opt-in because CI runners and developer machines may not always have Docker available.

Recommended flag:

```bash
COMPOSE_E2E_DOCKER=1 npm test
```

## Coverage discipline

New code should come with tests in the same PR. If a task modifies documentation-visible behaviour, examples must be updated in README and docs before merge.

A coverage failure must be fixed by adding meaningful tests first. Thresholds should only be changed when the project deliberately changes its coverage policy.

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
