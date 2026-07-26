# ADR 0003 — Guided command mode and GUI readiness

## Status

Accepted

## Context

`compose` must not only expose Docker Compose commands. It must also guide users through commands and options when they want help.

For example, `compose up --guided` should be able to ask whether the user wants detached mode, whether images should be built, whether orphan containers should be removed, and whether a service should be scaled.

At the same time, the project must remain ready for a future GUI. A GUI should not be forced to parse terminal help text or duplicate command rules.

## Decision

Implement guided mode through UI-neutral command descriptors and option descriptors.

The CLI prompt layer will consume these descriptors and ask terminal questions through a prompt adapter. A future GUI will consume the same descriptors to render forms, toggles, help text and confirmation screens.

The resolved output of guided mode must be the same typed request used by explicit CLI flags: `ComposeExecutionRequest` for Docker Compose execution and dedicated project mutation requests for project commands.

## Rationale

This keeps the architecture clean:

- Commander parses CLI arguments.
- Prompt adapters ask terminal questions.
- Command descriptors describe available options and guidance rules.
- Application services execute typed requests.
- GUI code can reuse the same descriptors and services later.

This prevents the traditional mistake of putting business decisions inside terminal-only code.

## Consequences

- Add `--guided`, `--yes` and `--no-interactive` behaviours.
- Add command descriptors for supported Compose commands.
- Add prompt plans per command.
- Add tests for resolving guided answers into command requests.
- Keep prompt code outside the command builder and executor.
- Keep all command metadata reusable outside the CLI.

## Non-goals

- Building the GUI now.
- Replacing scriptable flags with prompts.
- Asking questions during CI or non-interactive execution.
