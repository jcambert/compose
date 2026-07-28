# Release readiness

This document tracks what must be true before publishing the next npm release.

## Target release

Candidate version: `v0.2.0`.

Package version in this release branch: `0.2.0`.

This release preparation PR updates package metadata, changelog and release notes. It does not tag or publish the npm package automatically.

## Release scope

This release makes the post-`0.1.2` work available from npm.

Included milestones:

- PR #19 — GUI roadmap and CLI-first product backlog.
- PR #20 — reusable application service layer.
- PR #21 — hardened `compose doctor` diagnostics.
- PR #22 — local config path/export/import/reset.
- PR #23 — local UI server command through `compose ui`.
- PR #24 — React GUI MVP.
- PR #25 — terminal browser filtering and sorting.
- PR #26 — scanner exclusions and large-directory guard rails.
- PR #27 — local UI rendering fix for invalid generated JavaScript.
- PR #28 — release readiness and roadmap alignment.
- PR #29 — `v0.2.0` release metadata, changelog and release notes.

## Release blockers

Before publishing, confirm:

- `package.json` version is `0.2.0`.
- `package-lock.json` root package version is synchronized with `0.2.0`.
- `CHANGELOG.md` has a clear `0.2.0` section.
- README examples mention the new `compose ui`, browser filtering and scanner guard rail commands.
- `docs/releases/v0.2.0.md` exists and can be used as the GitHub release body.
- CI is green on the release PR.
- `npm pack --dry-run` contains `dist`, `README.md`, `CHANGELOG.md` and `docs`.
- The release workflow still uses npm Trusted Publishing.
- Post-publication validation still installs the exact package version and runs smoke checks.

## Local validation checklist

Run from a clean local checkout of `main` after the release PR is merged, or directly from the release branch before merge:

```bash
npm ci
npm run validate
```

Then run a source-built smoke pass:

```bash
npm run build
node ./dist/cli/index.js --version
node ./dist/cli/index.js doctor --skip-docker
node ./dist/cli/index.js scan . --max-depth 4 --json
node ./dist/cli/index.js browse --filter api --sort runtime --dry-run
node ./dist/cli/index.js ui --skip-docker --no-open
```

For a realistic local install check:

```bash
npm link
compose --version
compose doctor --skip-docker
compose scan . --max-depth 4
compose browse --filter api --sort runtime
```

For Windows-specific command discovery, verify that `compose doctor` still reports npm global prefix and PATH diagnostics.

## Manual UI check

Start the local UI from a workspace that contains at least one Compose file:

```bash
compose workspace add dev C:\Sources
compose workspace use dev
compose ui --workspace dev
```

Open the generated tokenized URL and verify:

- The page is not blank before React mounts.
- Browser console has no `Invalid or unexpected token` error.
- Doctor diagnostics render.
- Workspaces render.
- Stacks render.
- Selecting a stack loads runtime status or a clear runtime warning.
- Command preview shows the generated Docker Compose command.
- Execution remains disabled until explicit confirmation.
- `down`, `kill` and `rm` require destructive confirmation.

## Known limitation for v0.2.0

The current React MVP still uses browser ESM imports for React. In environments where that external source is blocked by proxy, TLS inspection or offline usage, the React app can fail to mount.

This limitation is documented and partially mitigated by a visible loading fallback. The durable fix is the follow-up GUI asset pipeline:

```text
build: bundle local GUI assets
```

Release preparation decision for this PR:

- Prepare `v0.2.0` with the limitation documented.
- Keep npm publication manual.
- Prefer completing bundled assets before broad non-technical user testing.

## GitHub release body

Use `docs/releases/v0.2.0.md` as the release body when creating the GitHub release or running the release workflow.

## After publish

After the release workflow publishes the package, verify the package installed from npm, not the local repo:

```bash
npm install -g @jc90100/compose@0.2.0
compose --version
compose doctor --skip-docker
compose scan . --max-depth 4
compose browse --filter api --sort runtime
```

If the release workflow is run with `publish=true`, the repository's post-publication validation should already perform the exact-version install and basic CLI checks.
