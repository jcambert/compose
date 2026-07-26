# Changelog

All notable changes to this project are documented here.

The project follows a pragmatic semver policy:

- patch releases fix bugs, docs or CI/release infrastructure
- minor releases add compatible user-facing commands or workflows
- major releases introduce breaking command syntax or configuration changes

## 0.1.2 - CLI package metadata fix

### Fixed

- `compose --version` now resolves the CLI version from `package.json` instead of using a hard-coded value.
- Package metadata is aligned with the public npm package scope `@jc90100/compose`.

### Added

- Unit coverage that verifies the CLI program version uses the package metadata source.

## 0.1.0 - Release candidate

### Added

- Initial `compose` binary and npm package setup.
- Recursive Compose file scanner.
- Docker Compose command builder and executor.
- Guided mode with UI-neutral command descriptors.
- Project creation, service mutation and YAML validation.
- Interactive stack browser with stack and service actions.
- Live stack and service runtime status via `docker compose ps --format json`.
- Local workspaces, favorites and recent stack persistence.
- Extended Docker Compose command surface for lifecycle, inspection, diagnostics, file copy and watch flows.
- Full browser exposure for the extended command surface, including destructive confirmations and prompts for `kill`, `rm`, `port` and `cp`.
- `compose doctor` diagnostics for Node.js, Docker, Docker Compose, config access and current workspace.
- CLI smoke tests and npm pack dry-run checks.
- Release workflow prepared for validation and optional npm publication.

### Changed

- CI now validates audit, lint, typecheck, tests, build, smoke tests and packaging dry-run.
- Package files include `dist`, `README.md`, `CHANGELOG.md` and `docs`.

### Notes

`0.1.0` is the first release-ready baseline. npm publication remains an explicit manual decision.
