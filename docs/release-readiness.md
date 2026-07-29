# Release readiness

This document tracks what must be true before publishing the next npm release.

## Target release

Candidate version: `v0.2.1`.

Package version in this release branch: `0.2.1`.

This release preparation does not tag or publish the npm package automatically.

## Release scope

This release makes the post-`0.2.0` work available from npm.

Included milestones:

- PR #32 — workspace management from the local UI.
- PR #33 — workspace management UX polish.
- PR #34 — GUI runtime and log streaming through Server-Sent Events.
- PR #35 — Live streams panel close/synchronization/scrollbar UX fixes.
- PR #36 — structured Docker Compose command failure diagnostics.
- PR #37 — `v0.2.1` release metadata, changelog and release notes.

## Release blockers

Before publishing, confirm:

- `package.json` version is `0.2.1`.
- `package-lock.json` root package version is synchronized with `0.2.1`.
- `CHANGELOG.md` has a clear `0.2.1` section.
- README examples still mention `compose ui`, workspace management, streaming and diagnostics.
- `docs/releases/v0.2.1.md` exists and can be used as the GitHub release body.
- CI is green on the release PR.
- `npm pack --dry-run` contains `dist`, `README.md`, `CHANGELOG.md` and `docs`.
- `npm run build` produces `dist/cli` and `dist/ui`.
- The local UI `index.html` does not depend on browser imports from `https://esm.sh`.
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
compose ui --skip-docker --no-open
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
- Browser network requests for UI code are local `/assets/*` requests.
- Browser console does not show failed requests to `https://esm.sh`.
- Doctor diagnostics render.
- Workspaces render.
- A workspace can be created, selected, edited and removed with confirmation.
- Stacks render.
- Selecting a stack loads runtime status or a clear runtime warning.
- The Live streams panel can be opened, closed and stopped without leaving stale streams.
- Runtime and log streams target the selected stack and clear old output when the selected stack changes.
- Command preview shows the generated Docker Compose command.
- Execution remains disabled until explicit confirmation.
- `down`, `kill` and `rm` require destructive confirmation.
- A failed command displays the structured diagnostic summary and keeps raw stdout/stderr available.

## GitHub release body

Use `docs/releases/v0.2.1.md` as the release body when creating the GitHub release or running the release workflow.

## After publish

After the release workflow publishes the package, verify the package installed from npm, not the local repo:

```bash
npm install -g @jc90100/compose@0.2.1
compose --version
compose doctor --skip-docker
compose scan . --max-depth 4
compose browse --filter api --sort runtime
compose ui --skip-docker --no-open
```

If the release workflow is run with `publish=true`, the repository's post-publication validation should already perform the exact-version install and basic CLI checks.
