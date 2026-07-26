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
feature/release-readiness
fix/windows-path-resolution
chore/release-workflow
```

## CI/CD

Every push and pull request runs:

1. dependency installation from `package-lock.json` using `npm ci`
2. security audit
3. lint
4. typecheck
5. tests with coverage
6. build
7. CLI smoke tests
8. npm package dry-run

The CI and release workflows use `actions/setup-node@v6` with npm cache enabled and `package-lock.json` as the cache dependency path.

The workflows test the package against Node.js 20 and Node.js 22. The package requires Node.js `>=20.19.0`, which aligns with the current ESLint 10 runtime requirement. GitHub-hosted runner aliases resolve to compatible latest patch versions.

Security audit is part of the validation pipeline through `npm audit --audit-level=moderate`. Audit fixes must be reviewed explicitly when they require major upgrades; avoid applying `npm audit fix --force` blindly.

Linting uses `tsconfig.eslint.json`, a dedicated TypeScript project that includes both `src` and `tests`. The production build keeps using `tsconfig.json`, which only compiles the CLI sources into `dist`.

Type checking runs with `exactOptionalPropertyTypes` enabled. Optional option objects must omit absent properties instead of passing properties explicitly set to `undefined`.

The release workflow validates the package, runs smoke tests and performs `npm pack --dry-run`. Publishing is prepared but remains explicit: run the workflow manually with `publish=true` after `NPM_TOKEN` is configured.

## Dependency lock policy

`package-lock.json` is committed and must stay synchronized with `package.json`.

Rules:

- Use `npm ci` for normal local validation and CI/CD.
- Use `npm install` only when intentionally changing dependencies.
- Commit `package.json` and `package-lock.json` together whenever dependency versions change.
- Do not hand-edit `package-lock.json`.
- Keep `npm audit --audit-level=moderate` green before merge.

## Packaging policy

The package must remain installable through the declared npm `bin` entry:

```json
{
  "bin": {
    "compose": "./dist/cli/index.js"
  }
}
```

`npm run smoke` validates the built CLI entrypoint and `npm run pack:dry-run` validates package contents before merge.

Packaged files:

- `dist`
- `README.md`
- `CHANGELOG.md`
- `docs`

Generated `dist` files must not be committed to the repository.

## Documentation updates

Each completed task must update the related documentation before merge.

Examples:

- Scanner behaviour changes update `docs/architecture.md` and README examples.
- New CLI flags update `docs/cli-design.md`.
- Test strategy changes update `docs/testing-strategy.md`.
- Release process changes update `docs/release.md` and `docs/devops.md`.

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
v0.1.0  first release-ready baseline
v0.2.0  project and service management hardening
v0.3.0  templates and advanced validation
v1.0.0  stable command contract
```

Release discipline:

- work through PRs only
- wait for green CI before merge
- squash merge
- do not rewrite `main` history
- tag releases from `main`
- run `compose doctor` on a real machine before npm publication

## Security practices

- Avoid shell string concatenation; build argument arrays.
- Keep `docker compose` execution explicit and visible.
- Add dry-run support for safety.
- Confirm destructive browser actions.
- Validate YAML before writing.
- Review npm dependencies before release.
- Keep `npm audit --audit-level=moderate` green in CI.
- Prefer least-privilege GitHub tokens.
