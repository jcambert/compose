# npm audit remediation

## Context

A local `npm audit` report identified vulnerabilities in development tooling dependency chains:

- `brace-expansion` through ESLint-related packages
- `esbuild` through Vitest/Vite-related packages

The report recommended forced upgrades that involve major versions. The remediation must therefore be explicit and reviewed rather than applied through a blind `npm audit fix --force`.

## Remediation strategy

- Upgrade ESLint to the current ESLint 10 line using a published npm version.
- Pin `@eslint/js` to a published ESLint JavaScript package version instead of assuming it always has the same latest patch number as `eslint`.
- Keep `typescript-eslint` on the latest published line that declares support for ESLint `^8.57.0 || ^9.0.0 || ^10.0.0`.
- Upgrade Vitest and `@vitest/coverage-v8` together on the same published minor/patch line.
- Raise the Node.js engine floor to `>=20.19.0`, matching the current ESLint 10 runtime requirement.
- Add `npm audit --audit-level=moderate` to CI after dependency installation.

## Current package ranges

```json
{
  "@eslint/js": "^10.0.1",
  "eslint": "^10.7.0",
  "typescript-eslint": "^8.65.0",
  "vitest": "^4.1.9",
  "@vitest/coverage-v8": "^4.1.9"
}
```

The ranges intentionally target versions that are already published in npm. This avoids `ETARGET` failures while keeping semver-compatible patch updates available.

## Validation

The branch must pass:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate
```

Once a `package-lock.json` is committed, CI should move back from `npm install` to `npm ci`.
