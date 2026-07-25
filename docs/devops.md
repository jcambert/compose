# DevOps

## Branching model

Use short-lived branches:

```text
feature/<scope>
fix/<scope>
chore/<scope>
```

Examples:

```text
feature/compose-scanner
feature/compose-executor
feature/project-management
fix/windows-path-resolution
chore/release-workflow
```

## CI/CD

Every push and pull request runs:

1. dependency installation
2. lint
3. typecheck
4. tests with coverage
5. build

The release workflow is tag-triggered and starts with `npm publish --dry-run`. Real publishing should only be enabled after `NPM_TOKEN` is configured.

## Documentation updates

Each completed task must update the related documentation before merge.

Examples:

- Scanner behaviour changes update `docs/architecture.md` and README examples.
- New CLI flags update `docs/cli-design.md`.
- Test strategy changes update `docs/testing-strategy.md`.
- Process changes update `docs/devops.md`.

## Definition of Done

A task is done when:

- Code is implemented.
- Tests cover the behaviour.
- Documentation is updated.
- CI is green.
- The branch is ready to merge.

## Release strategy

Initial releases should follow semantic versioning:

```text
v0.1.0  first usable discovery and command execution
v0.2.0  project and service management hardening
v0.3.0  templates and advanced validation
v1.0.0  stable command contract
```

## Security practices

- Avoid shell string concatenation; build argument arrays.
- Keep `docker compose` execution explicit and visible.
- Add dry-run support for safety.
- Validate YAML before writing.
- Review npm dependencies before release.
- Prefer least-privilege GitHub tokens.
