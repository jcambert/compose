# Testing Strategy

## Objective

The long-term objective is total coverage for core modules and strong integration coverage for CLI workflows.

The initial threshold is intentionally strict but realistic:

- Lines: 90%
- Statements: 90%
- Functions: 90%
- Branches: 85%

Thresholds should be raised toward 100% as the command surface stabilises.

## Test categories

### Unit tests

Targets:

- Compose filename detection.
- Recursive scanning.
- YAML parsing.
- YAML validation.
- Service mutations.
- Compose command generation.
- Path resolution.

### Integration tests

Targets:

- Scan fixture trees.
- Create project in a temporary directory.
- Add and remove services.
- Validate generated YAML.
- Dry-run Compose execution.

### Optional Docker tests

Docker-backed tests must be opt-in because CI runners and developer machines may not always have Docker available.

Recommended flag:

```bash
COMPOSE_E2E_DOCKER=1 npm test
```

## Coverage discipline

New code should come with tests in the same PR. If a task modifies documentation-visible behaviour, examples must be updated in README and docs before merge.

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
