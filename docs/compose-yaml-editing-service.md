# Compose editing service implementation

This document tracks the implementation slice for PR #41: the shared Compose document editing service and YAML mutation layer.

## Scope

This slice implements the core service only. It does not add browser screens yet.

Delivered pieces:

- `src/yaml/compose-service-editor.ts`
- `src/app/compose-editing-service.ts`
- unit tests for the pure YAML editor
- unit tests for the file-backed application service

## Pure YAML editor

The pure editor exposes an editable service model for common Docker Compose service fields:

- `image`
- `build`
- `ports`
- `environment`
- `volumes`
- `depends_on`
- `command`
- `restart`

The editor separates fields into:

```text
known editable fields
known read-only fields
unknown preserved fields
```

Known read-only and unknown service keys are preserved during mutations. Top-level Compose sections such as `volumes`, `networks`, `configs`, `secrets` and extension keys remain part of the document and are not removed by service operations.

## Application service

The shared application service exposes these operations:

```ts
listComposeServices(input)
previewCreateComposeService(input)
previewUpdateComposeService(input)
previewDeleteComposeService(input)
commitComposeServiceMutation(input)
```

Preview and commit are intentionally separate. The preview result contains:

- operation type
- target Compose file path
- service name
- original content hash
- before YAML snippet when applicable
- after YAML snippet when applicable
- unified diff text
- next Compose file content
- validation result
- warnings for preserved non-guided fields

Commit validates the generated content again before writing.

## Safety model

The commit flow uses optimistic file-change protection:

1. The service reads the Compose file and computes a SHA-256 content hash.
2. The preview carries the original content hash.
3. Commit reads the current file again.
4. Commit is rejected if the file changed after preview generation.
5. The generated content is parsed and validated before writing.

This prevents the first local UI implementation from overwriting external edits made in another editor between preview and save.

## Validation

Unit tests cover:

- listing editable services
- surfacing read-only and preserved keys
- creating services
- updating common service fields
- deleting services
- preserving unknown service keys
- preserving unrelated services and top-level sections
- generating diff previews
- rejecting duplicate services
- rejecting missing services
- rejecting invalid YAML
- rejecting commit when the file changed after preview

## Follow-up

PR #42 should wire this service into the local UI server and React screens:

- token-protected endpoints
- service list from selected stack details
- guided create/edit/delete forms
- diff preview before save
- explicit commit confirmation
- validation and write diagnostics in the browser
