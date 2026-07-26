# npm audit remediation

## Context

A local `npm audit` report identified vulnerabilities in development tooling dependency chains:

- `brace-expansion` through ESLint-related packages
- `esbuild` through Vitest/Vite-related packages

The report recommended forced upgrades that involve major versions. The remediation must therefore be explicit and reviewed rather than applied through a blind `npm audit fix --force`.

## Remediation strategy

- Upgrade ESLint and `@eslint/js` to the current major line that contains the advisory fix path.
- Upgrade `typescript-eslint` to a line that supports ESLint 10.
- Upgrade Vitest and `@vitest/coverage-v8` together so their versions stay aligned.
- Raise the Node.js engine floor to `>=20.19.0`, matching the current ESLint 10 runtime requirement.
- Add `npm audit --audit-level=moderate` to CI after dependency installation.

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
