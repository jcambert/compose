# Changelog

All notable changes to this project are documented here.

The project follows a pragmatic semver policy:

- patch releases fix bugs, docs or CI/release infrastructure
- minor releases add compatible user-facing commands or workflows
- major releases introduce breaking command syntax or configuration changes

## 0.2.0 - Local UI, reusable services and large workspace hardening

### Added

- Reusable `src/app` application service layer for scanner, workspace, favorites, doctor, config, project mutation, command preview and command execution use cases.
- Hardened `compose doctor` diagnostics for package version, executable discovery, npm global prefix, PATH integration, Node.js, Docker, Docker Compose, config access and current workspace.
- Local configuration management commands: `compose config path`, `compose config export`, `compose config import` and `compose config reset`.
- Optional local UI server launched with `compose ui`, bound to `127.0.0.1`, protected by a short-lived token and backed by the same application services as the CLI.
- React-based local UI MVP for doctor diagnostics, workspaces, stacks, stack details, runtime summary, command preview and command execution result display.
- Bundled local UI asset pipeline that builds React with Vite into `dist/ui` for npm packaging.
- Terminal browser filtering and sorting through `compose browse --filter <text>` and `compose browse --sort name|path|services|runtime`.
- Scanner exclusions, symbolic link skipping, traversal guard rails and `compose scan --exclude`, `--max-directories` and `--max-entries` options for large source folders.
- Release readiness documentation for the `v0.2.0` publication process.

### Changed

- CLI commands now delegate more behaviour through reusable application services while keeping Commander and prompt handling in the CLI adapter.
- Scanner warnings can be surfaced without polluting `compose scan --json` stdout.
- The local UI keeps command execution behind explicit preview and confirmation flows, with stronger confirmation for destructive commands.
- `compose ui` now serves bundled `dist/ui/index.html` and `/assets/*` files instead of browser ESM imports from an external CDN.
- Product backlog and GUI roadmap now reflect the CLI-first direction and the delivered optional local UI milestones.

### Fixed

- `compose ui` no longer serves invalid generated JavaScript for command execution output containing newline joins.
- The local UI root now includes a visible loading fallback so a browser page is not completely blank before React mounts.
- The local UI no longer depends on access to `esm.sh` or another browser-side React CDN at runtime.
- Scanner traversal now avoids common generated, dependency-heavy, IDE and cache directories by default.

### Notes

The local UI is still intentionally lightweight and CLI-first. It is now bundled with the npm package, while richer service details and log/runtime streaming remain follow-up GUI improvements.

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
