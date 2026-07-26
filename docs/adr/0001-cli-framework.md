# ADR 0001 — CLI framework

## Status

Accepted

## Context

The CLI must be professional, maintainable, typed, scriptable and easy to distribute via npm. The expected command name is `compose`, with direct commands such as `compose up`, `compose scan` and `compose project init`.

## Decision

Use Commander for the first implementation.

## Rationale

Commander keeps the executable simple, explicit and easy to test. It is enough for the initial command tree and avoids framework ceremony while the product contract is still being shaped.

Oclif remains a possible future migration if the CLI grows into a plugin-based platform with generated documentation, plugins and multi-package command distribution.

## Consequences

- Command registration stays in `src/cli/program.ts`.
- The binary is a simple Node.js entrypoint at `dist/cli/index.js`.
- Interactive flows use `@inquirer/prompts` and remain optional.
