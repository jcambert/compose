# Simplified Compose YAML editing

## Purpose

This document designs the next product increment after `v0.2.2`: guided editing of Docker Compose service definitions for users who can operate stacks but are not Docker Compose YAML specialists.

The goal is not to hide Docker Compose or replace its model. The goal is to make common service changes safer, clearer and reversible while keeping the real Compose file as the source of truth.

## Product goals

- Let a user create a service in an existing stack without writing raw YAML.
- Let a user edit common service fields through guided forms.
- Let a user delete a service only after explicit confirmation.
- Preview YAML changes before writing to disk.
- Validate the resulting Compose document before saving.
- Preserve existing advanced or unsupported YAML sections.
- Keep CLI workflows and raw files fully usable outside the GUI.

## Non-goals

- Do not build a generic raw YAML IDE.
- Do not create a second configuration format.
- Do not invent a Compose-compatible abstraction that diverges from Docker Compose semantics.
- Do not regenerate complete files when a targeted mutation is enough.
- Do not support every Compose key in the first increment.
- Do not create a template catalog as part of the editing feature.

## User experience model

The local UI should expose a `Compose file` or `Edit services` workflow from the selected stack detail screen.

A non-specialist user should see three levels of information:

1. A service list with clear labels such as name, image/build source, ports, volumes and dependencies.
2. A guided service form for common fields.
3. An advanced/unsupported summary showing that extra YAML keys exist and will be preserved.

The first editing experience should be form-first, with a YAML diff preview before save. Raw YAML may be shown as read-only context or an advanced follow-up, but it must not be the primary editing interaction.

## Editable service model

The first version should cover common service-level keys:

- `image`
- `build`
- `ports`
- `environment`
- `volumes`
- `depends_on`
- `command`
- `restart`

The editable model should distinguish three groups:

```text
known editable fields      fields the guided UI can edit safely
known read-only fields     fields the UI can display but not edit yet
unknown preserved fields   fields kept untouched during mutation
```

A proposed TypeScript boundary:

```ts
export interface EditableComposeService {
  name: string;
  image?: string;
  build?: string | ComposeBuildForm;
  ports: ComposePortForm[];
  environment: ComposeEnvironmentEntry[];
  volumes: ComposeVolumeForm[];
  dependsOn: string[];
  command?: string;
  restart?: string;
  readOnlyKeys: string[];
  preservedKeys: string[];
}
```

The exact implementation can evolve, but the service boundary should remain explicit about what is editable and what is preserved.

## Application service boundary

Add a shared application service under `src/app/compose-editing-service.ts`.

Expected responsibilities:

- Resolve the selected stack and Compose file path through existing stack/project resolution.
- Read the Compose YAML document through the existing YAML layer.
- Return editable service summaries.
- Build a preview for create/update/delete operations.
- Validate the resulting document before saving.
- Persist changes only after explicit confirmation.
- Return clear diagnostics when parsing, validation or write operations fail.

Proposed operations:

```ts
listServices(input): Promise<ComposeServiceListResult>
previewCreateService(input): Promise<ComposeServiceMutationPreview>
previewUpdateService(input): Promise<ComposeServiceMutationPreview>
previewDeleteService(input): Promise<ComposeServiceMutationPreview>
commitMutation(input): Promise<ComposeServiceMutationResult>
```

Preview and commit should be separate operations so the UI can always show the generated YAML diff before writing.

## YAML mutation strategy

The mutation layer should live under `src/yaml/compose-service-editor.ts`.

It should parse the YAML document into an AST/document structure and perform targeted mutations inside `services.<serviceName>`. The implementation should avoid serializing a brand-new object for the whole file when a narrower mutation is possible.

Rules:

- Keep top-level keys such as `networks`, `volumes`, `configs`, `secrets` and extensions untouched.
- Preserve service-level keys that the guided form does not edit.
- Preserve comments and formatting when the YAML library can do so safely.
- Reject ambiguous writes instead of guessing.
- Validate the final document before returning a commit-ready mutation.

For deletion, remove only `services.<serviceName>`. Do not automatically remove referenced networks, volumes, configs or secrets in the first increment.

## Diff preview

Each mutation preview should return:

- operation type: `create`, `update` or `delete`
- target Compose file path
- service name
- before YAML snippet when applicable
- after YAML snippet when applicable
- unified diff text
- validation result
- warnings about preserved unsupported keys

The UI should require explicit confirmation before committing the preview.

## Validation and diagnostics

Validation should happen at three moments:

1. When reading the original Compose file.
2. When building the preview.
3. Immediately before writing the file.

Expected diagnostics:

- YAML parse error.
- Missing `services` section.
- Duplicate service name on create.
- Missing service name on update/delete.
- Invalid port mapping format.
- Invalid environment entry.
- Unsupported build form in the guided editor.
- File changed since preview was generated.
- File write denied or failed.

The service should return typed diagnostics rather than plain strings, aligned with the existing command failure diagnostic direction.

## Concurrency and safety

To avoid overwriting changes made outside the UI:

- Include the original file hash or last read marker in each preview.
- Require the same marker when committing.
- Reject commit when the file changed since preview.
- Ask the user to refresh and rebuild the preview.

All write endpoints must remain local-only and token-protected through `compose ui`.

## Local UI API shape

Add token-protected endpoints to the existing local UI server:

```text
GET  /api/stacks/:stackId/compose/services
POST /api/stacks/:stackId/compose/services/preview
POST /api/stacks/:stackId/compose/services/commit
```

The preview endpoint should handle create, update and delete requests through a discriminated payload. The commit endpoint should accept a preview identifier or mutation token generated by the application service.

The browser should not receive arbitrary filesystem write access. It should operate only through stack IDs already resolved by the local app service.

## CLI shape

The first implementation can focus on the local UI. A follow-up CLI workflow can reuse the same service:

```bash
compose service list --project ./infra
compose service add --project ./infra
compose service edit api --project ./infra
compose service remove api --project ./infra
```

This CLI shape is intentionally deferred. The design must still keep the application service UI-neutral so the CLI can reuse it later.

## Testing plan

Unit tests should cover:

- Listing services from simple and multi-service Compose files.
- Creating a service in a file with existing services.
- Creating the first service when `services` is missing or empty, if supported by the implementation.
- Updating image, ports, environment and volumes.
- Deleting one service while preserving unrelated services.
- Preserving unknown service keys and top-level keys.
- Rejecting duplicate service names.
- Rejecting invalid YAML.
- Rejecting commit when the file changed after preview.
- Producing a useful diff preview.

Integration-level local UI server tests should cover token protection and the preview/commit flow with fake filesystem boundaries.

## Delivery slicing

### PR #41 — Compose document editing service

Implement the service and YAML mutation layer without browser UI complexity.

Deliverables:

- `src/app/compose-editing-service.ts`
- `src/yaml/compose-service-editor.ts`
- typed inputs/results/diagnostics
- unit tests for list/create/update/delete/validation/preservation

### PR #42 — Local UI guided service editing

Expose the guided editing flow in `compose ui`.

Deliverables:

- token-protected local API endpoints
- service list view/action from stack details
- create/edit/delete guided forms
- diff preview
- explicit commit confirmation
- browser error and validation diagnostics

### PR #43 — Windows and real-stack validation

Validate the published package on Windows with real Compose files.

Deliverables:

- install from npm
- validate stack scan and UI editing flows
- verify file backup/revert story manually
- document any operational caveats

## Open questions

- Should the first version write `.bak` files before committing changes?
- Should service renaming be allowed, or should it be a later explicit operation?
- Should profile support be editable in the first UI version?
- Should environment be displayed as key/value pairs only, or should list syntax also be preserved exactly?
- Should the preview include a side-by-side UI diff or a unified diff only?

The implementation should answer these conservatively: preserve more, mutate less, and require explicit confirmation before writing.
