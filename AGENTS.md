# Repository Guidelines

## Project Structure & Module Organization

`src/` contains the TypeScript application. Keep domain logic in its focused module: `app/` for reusable services, `cli/` for Commander registration and terminal adapters, `compose/` for Docker Compose execution, `scanner/` for discovery, `workspace/` for persisted settings, and `yaml/` for Compose documents. `interactive/` and `guided/` hold UI-neutral interaction flows. The optional local React UI lives in `src/ui/` and is bundled to `dist/ui/`.

Place tests under `tests/unit/` using matching names such as `compose-command-builder.test.ts`. Keep architecture and behaviour notes in `docs/`; add an ADR in `docs/adr/` for significant decisions. Do not edit generated `dist/` output manually.

## Build, Test, and Development Commands

Use Node.js 20.19 or later and install locked dependencies with `npm ci`.

- `npm run build` compiles the CLI and bundles the UI.
- `npm run lint` runs ESLint; `npm run typecheck` performs TypeScript checks.
- `npm test` runs Vitest with coverage; `npm run test:watch` is for iterative work.
- `npm run smoke` checks the built CLI, after building.
- `npm run validate` runs the complete pre-merge suite, including audit and package validation.

For local CLI checks, run `npm run build`, then `npm link` and `compose --help`. Use `compose ui --skip-docker --no-open` when Docker is unavailable.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF endings, two-space indentation, final newlines, and no trailing whitespace (Markdown is exempt). Write ESM TypeScript with explicit, small modules and injectable dependencies around filesystem, process, and prompt operations. Use `kebab-case.ts` filenames, `camelCase` values/functions, and `PascalCase` types, classes, and React components. Run `npm run lint` before submitting; do not bypass formatting or type errors.

## Testing Guidelines

Use Vitest and name tests `*.test.ts`. Add meaningful unit tests with every behavioural change; prefer fakes for Docker, prompts, and filesystem boundaries so tests remain deterministic. Core-module coverage thresholds are 90% for lines, statements, and functions, and 85% for branches. Docker-backed tests are opt-in: `COMPOSE_E2E_DOCKER=1 npm test`.

## Commit & Pull Request Guidelines

Use concise Conventional Commit-style subjects seen in history: `feat:`, `fix:`, `chore:`, `build:`, or `release:`. Keep each commit scoped to one coherent change. PRs should explain user-visible behaviour, link relevant issues, include UI screenshots when applicable, update related README/docs, and pass `npm run validate`. Do not rewrite `main` history; wait for CI to succeed before merge.
