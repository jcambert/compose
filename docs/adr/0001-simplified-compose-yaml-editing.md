# ADR 0001 — Simplified Compose YAML service editing

## Status

Accepted for implementation planning.

## Context

`compose` already discovers, inspects, operates and diagnoses Docker Compose stacks from both CLI and optional local UI workflows. The next product need is to let users manipulate service definitions in existing Compose YAML files without requiring them to become Docker Compose YAML specialists.

The project must remain CLI-first. The local GUI must stay optional, local-only and backed by shared application services. The GUI must not introduce a second configuration model or an incompatible abstraction over Docker Compose.

## Decision

Implement Compose editing as a guided service-definition workflow backed by shared application services and targeted YAML document mutations.

The first implementation will focus on service-level create, update and delete operations. It will expose common fields through guided forms and preserve unsupported YAML content rather than attempting to fully regenerate Compose files.

The editing workflow will be preview-first:

1. Read the selected stack Compose file.
2. Build an editable service model.
3. Create a mutation preview.
4. Show the YAML diff and validation result.
5. Commit only after explicit confirmation.
6. Reject the commit if the file changed since the preview was generated.

## Consequences

Positive consequences:

- Non-specialist users can perform common Compose service changes safely.
- The real Compose YAML file remains the source of truth.
- The CLI and GUI can reuse the same application service.
- Advanced YAML sections remain available for expert users and external tooling.
- File writes stay explicit, local-only and token-protected.

Trade-offs:

- The first editor will not support every Docker Compose key.
- Complex service definitions may contain preserved read-only areas.
- Some formatting/comment preservation depends on the YAML document API.
- The UI must explain preserved advanced keys clearly to avoid false confidence.

## Implementation rules

- Do not create a separate configuration format.
- Do not regenerate the full file unless needed.
- Do not silently drop unsupported keys.
- Do not expose arbitrary filesystem write APIs to the browser.
- Validate before saving.
- Show a diff before saving.
- Use explicit confirmation for deletion and writes.
- Keep the service UI-neutral so terminal workflows can reuse it later.

## Follow-up work

- PR #41: implement the application service and YAML mutation layer.
- PR #42: expose guided service editing in `compose ui`.
- PR #43: validate Windows and real-stack editing workflows.
