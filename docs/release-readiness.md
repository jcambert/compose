# Release readiness

This document tracks what must be true before publishing the next npm release.

## Target release

Candidate version: `v0.2.0`.

Current package version before the release PR: `0.1.2`.

The release PR must update version metadata separately from this documentation alignment PR.

## Release scope

The next release should make the post-`0.1.2` work available from npm.

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

## Release blockers

Before publishing, the release PR must confirm:

- `package.json` version is bumped consistently.
- `package-lock.json` is synchronized with the new package version.
- `CHANGELOG.md` has a clear `v0.2.0` section.
- README examples are not misleading for the new commands.
- CI is green on the release PR.
- `npm pack --dry-run` contains `dist`, `README.md`, `CHANGELOG.md` and `docs`.
- The release workflow still uses npm Trusted Publishing.
- Post-publication validation still installs the exact package version and runs smoke checks.

## Local validation checklist

Run from a clean local checkout of `main` or the release branch:

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

## Known limitation for v0.2.0 decision

The current React MVP still uses browser ESM imports for React. In environments where that external source is blocked by proxy, TLS inspection or offline usage, the React app can fail to mount.

This limitation is now documented and partially mitigated by a visible loading fallback. The durable fix is the follow-up GUI asset pipeline:

```text
build: bundle local GUI assets
```

Release decision:

- Option A: publish `v0.2.0` with the limitation documented, then immediately deliver bundled assets.
- Option B: treat bundled assets as a release blocker and publish `v0.2.0` only after the asset pipeline PR.

The preferred product-quality path is Option B when the release is intended for broader user testing.

## After publish

After the release workflow publishes the package, verify the package installed from npm, not the local repo:

```bash
npm install -g @jc90100/compose@0.2.0
compose --version
compose doctor --skip-docker
compose scan . --max-depth 4
```

If the release workflow is run with `publish=true`, the repository's post-publication validation should already perform the exact-version install and basic CLI checks.
