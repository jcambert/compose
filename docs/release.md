# Release Process

## Objective

The release process keeps `compose` installable, smoke-tested and package-ready before any npm publication.

## Current package version

The current package version is `0.1.2`.

The public npm package is:

```bash
npm install -g @jc90100/compose
```

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

## CLI version source

`compose --version` must use `package.json` as the single source of truth.

Do not hard-code the CLI version in source files. Version bumps must update package metadata and should be covered by tests that compare the program version with `package.json`.

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

The release workflow can be started manually and also reacts to `v*` tags. Manual publishing requires the `publish` input to be set to `true`.

npm publication from GitHub Actions uses npm Trusted Publishing through OpenID Connect. The release workflow must keep the following permissions:

```yaml
permissions:
  contents: read
  id-token: write
```

The npm package `@jc90100/compose` must be configured on npmjs.com with a trusted publisher targeting this repository and the `release.yml` workflow.

## Tagging

Recommended flow:

```bash
git checkout main
git pull
git tag v0.1.2
git push origin v0.1.2
```

The tag workflow validates the package and performs a pack dry-run. npm publication remains an explicit manual action.

## npm publication

Publish the package from a validated release commit only by running the GitHub `Release` workflow manually with `publish=true`.

The workflow runs:

```bash
npm publish --access public
```

Then verify the public package:

```bash
npm view @jc90100/compose version
npm install -g @jc90100/compose@latest
compose --version
compose doctor
```

## Repository hygiene

- Work on a branch per step.
- Open a PR for every change.
- Wait for CI to be green before merging.
- Squash merge PRs.
- Do not rewrite `main` history.
- Do not commit generated `dist` files.
- Do not keep temporary workflow files or bootstrap artifacts in the final diff.
