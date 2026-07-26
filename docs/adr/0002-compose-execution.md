# ADR 0002 — Docker Compose execution

## Status

Accepted

## Context

The CLI must expose Docker Compose commands such as `up`, `down`, `ps`, `logs`, `build`, `pull`, `exec`, `run` and `restart`.

## Decision

Use `docker compose` through a typed command builder and an Execa-backed process executor.

## Rationale

Docker Compose is a CLI-level feature. Reimplementing it through Docker Engine APIs would be incomplete and would risk drifting from official Compose behaviour.

The command builder returns an argument array, never a shell-concatenated string. This is safer, easier to test and works better with paths containing spaces.

## Consequences

- `dockerode` is not the default execution layer.
- Dry-run can print the exact command before execution.
- Tests can validate argument generation without requiring Docker.
