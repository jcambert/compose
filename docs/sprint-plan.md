# Two-week Sprint Plan

## Sprint goal

Deliver a usable first version of `compose` with project discovery, command generation, YAML validation, project creation, service mutation, CI/CD and living documentation.

## Week 1

### Day 1 — Foundation

Branch: `feature/cli-foundation`

Tasks:

- Initialise Node.js + TypeScript structure.
- Add npm binary `compose`.
- Add lint, typecheck, test and build scripts.
- Add CI workflow.
- Document architecture and CLI design.

### Day 2 — Scanner

Branch: `feature/compose-scanner`

Tasks:

- Implement recursive scanner.
- Add Compose filename detection.
- Add directory exclusions.
- Add JSON and human output.
- Add scanner tests.

### Day 3 — YAML layer

Branch: `feature/yaml-validation`

Tasks:

- Implement Compose parser.
- Add Zod schemas.
- Add writer.
- Add validation tests.
- Update documentation.

### Day 4 — Command builder

Branch: `feature/compose-command-builder`

Tasks:

- Implement request model.
- Implement command builder.
- Support dry-run.
- Add command-generation tests.

### Day 5 — First internal integration

Branch: `feature/cli-integration`

Tasks:

- Wire scanner and command builder into CLI.
- Add project path resolver.
- Validate examples from docs.
- Stabilise CI.

## Week 2

### Day 6 — Compose execution

Branch: `feature/compose-executor`

Tasks:

- Implement Execa-backed execution.
- Stream process output.
- Return structured results.
- Add error handling.

### Day 7 — Project creation

Branch: `feature/project-init`

Tasks:

- Implement standard Compose project factory.
- Add `compose project init`.
- Add docs and tests.

### Day 8 — Service mutations

Branch: `feature/service-management`

Tasks:

- Add service creation.
- Add service removal.
- Add service updates.
- Validate before write.

### Day 9 — Coverage hardening

Branch: `feature/test-coverage-hardening`

Tasks:

- Add missing branch tests.
- Raise thresholds progressively.
- Add fixtures.
- Document coverage strategy.

### Day 10 — Release readiness

Branch: `feature/release-readiness`

Tasks:

- Add release workflow dry-run.
- Review README.
- Review ADRs.
- Prepare first version tag strategy.

## Merge policy

- One branch per coherent step.
- Pull request required.
- CI must be green before merge.
- Documentation must be updated before merge.
- Prefer squash merge for a clean history.
