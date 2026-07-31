# ADR 0004: Stack-scoped raw document editing

## Status

Accepted for the Dockge Compose-page parity initiative.

## Context

The guided service editor safely covers common fields, but Dockge's Compose page
also lets an operator edit the complete `compose.yaml` and `.env` files. Advanced
Compose keys, comments, anchors and extension fields cannot all be represented by
the guided form without creating a second, incomplete Compose model.

Raw editing increases the consequences of stale writes and invalid input. The
local UI also discovers projects in general-purpose directories, unlike Dockge's
dedicated stacks directory, so recursive stack deletion would be unsafe.

## Decision

Add a stack-document application service with these boundaries:

- Existing targets are resolved from server-side discovered projects; browser
  input never supplies an unrestricted file path.
- New targets are resolved beneath the active workspace from a validated stack name.
- Every edit is parsed and schema-validated, then returned as a diff preview.
- Preview hashes cover both `compose.yaml` and `.env`; commits use optimistic
  concurrency and atomic file replacement.
- The raw source text is committed unchanged after validation, preserving comments and advanced YAML syntax.
- Stack deletion removes only a known Compose file and `.env`, and only when the
  containing directory has no unrelated entries. Recursive deletion is forbidden.
- Docker lifecycle commands continue through the existing typed command service.

The guided editor remains the default workflow for common service changes. Raw
editing is labelled as an advanced mode and is not the only editing path.

## Consequences

- Advanced Compose documents can be managed without lossy regeneration.
- Concurrent external edits are detected before overwrite.
- App-created, file-only stack directories can be deleted safely; arbitrary source repositories cannot be deleted from the UI.
- Whole-document edits and guided service edits share the same real Compose file,
  so each successful mutation must refresh the other view.
- A bidirectional container PTY remains a separate decision because it requires a
  WebSocket and shell-execution threat model beyond this ADR.
