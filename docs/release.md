# Release Process

## Objective

The release process keeps `compose` installable, smoke-tested and package-ready before any npm publication.

## Current package version

The current package version is `0.1.0`.

Use patch/minor version changes deliberately:

- patch: bug fix, documentation, CI hardening
- minor: new user-facing command or browser workflow
- major: breaking command syntax or configuration format change

## Local release readiness

Before cutting a release candidate, run:

```bash
npm ci
npm run validate
```

`npm run validate` runs:

1. lint
2. typecheck
3. unit tests with coverage
4. npm audit
5. build
6. CLI smoke tests
7. npm pack dry-run

Individual commands are also available:

```bash
npm run build
npm run smoke
npm run pack:dry-run
compose doctor
```

## CLI smoke tests

The smoke test validates the built CLI entrypoint without requiring Docker:

- `compose --help`
- `compose scan --help`
- `compose browse --help`
- `compose workspace --help`
- `compose doctor --help`
- `compose doctor --skip-docker`

The smoke test also checks that `dist/cli/index.js` keeps the Node.js shebang.

## Doctor diagnostics

Use `compose doctor` on real developer machines before a release:

```bash
compose doctor
compose doctor --strict
compose doctor --json
```

The command verifies Node.js, Docker, Docker Compose, local configuration path access and the current workspace.

CI can run `compose doctor --skip-docker` when Docker is intentionally unavailable.

## GitHub Actions

CI validates every branch and pull request with:

1. `npm ci`
2. `npm run audit`
3. `npm run lint`
4. `npm run typecheck`
5. `npm test`
6. `npm run build`
7. `npm run smoke`
8. `npm run pack:dry-run`

The release workflow can be started manually and also reacts to `v*` tags. Manual publishing requires the `publish` input to be set to `true` and `NPM_TOKEN` to be configured in repository secrets.

## Tagging

Recommended flow:

```bash
git checkout main
git pull
git tag v0.1.0
git push origin v0.1.0
```

The tag workflow validates the package and performs a pack dry-run. npm publication remains an explicit manual action.

## Repository hygiene

- Work on a branch per step.
- Open a PR for every change.
- Wait for CI to be green before merging.
- Squash merge PRs.
- Do not rewrite `main` history.
- Do not commit generated `dist` files.
- Do not keep temporary workflow files or bootstrap artifacts in the final diff.
