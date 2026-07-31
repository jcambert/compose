# Dockge Compose Page Parity Backlog

## Objective

Provide a local, token-protected Compose workspace page with the editing and
stack-management capabilities exposed by Dockge's `Compose.vue`, while keeping
`compose` CLI-first and reusing its application services.

Reference implementation reviewed:

- `E:\projets\Informatique\dockge\frontend\src\pages\Compose.vue`
- `frontend/src/components/Container.vue`, `NetworkInput.vue`, `ArrayInput.vue`
  and `Terminal.vue`
- `backend/agent-socket-handlers/docker-socket-handler.ts`
- `backend/stack.ts`

## Functional inventory

| Dockge capability | Existing Compose capability | Delivery decision |
| --- | --- | --- |
| Stack runtime overview | Stack and service runtime API | Reuse in the unified Compose workspace |
| Stack start, stop, restart and down | Typed command preview/execution | Reuse with explicit destructive confirmation |
| Stack update (`pull`, then `up`) | Typed `pull` and `up` commands | Orchestrate the two existing commands in the UI |
| Service start, stop and restart | Existing stack service actions | Reuse in the unified page |
| Published URL shortcuts | Published-port extraction | Reuse and add `x-dockge.urls` document links |
| Raw `compose.yaml` editor | Guided service editor only | Add validated raw document editing as an advanced mode |
| `.env` editor | Not available | Add optimistic, stack-scoped `.env` editing |
| YAML validation | Compose parser and Zod schema | Reuse before every preview and commit |
| Save draft | Service-level mutation commit | Add whole-document preview and atomic commit |
| Deploy edited stack | Command execution | Commit the reviewed document, then run `up -d --remove-orphans` |
| Create stack | CLI project factory only | Add workspace-scoped create preview and commit |
| Delete stack | Not exposed in UI | Add conservative deletion for app-managed, file-only stack folders |
| Edit common service fields | Guided service editor | Embed the existing guided workflow |
| Edit networks and advanced keys | No dedicated form | Preserve and expose through advanced YAML editing |
| Combined logs terminal | Token-protected log SSE | Reuse the live streams panel and operation output console |
| Interactive container shell | Typed one-shot `exec` command | Keep one-shot exec in Commands; interactive PTY remains a separate security epic |
| Remote Dockge agents | Local workspaces | Not applicable to the local-only product model |

## Epic P5 — Unified Compose workspace

### US P5.1 — Read a complete stack document

As an operator, I can open a selected stack and see its Compose YAML, `.env`,
services, networks, declared URLs and current runtime state in one place.

Acceptance criteria:

- The API only reads files belonging to a discovered stack.
- Missing `.env` files are represented as empty content.
- Responses include content hashes used for optimistic concurrency.
- Declared `x-dockge.urls` and network names are summarized without losing raw document content.
- Unit and API tests cover successful reads, missing `.env` and invalid YAML.

Status: completed locally; pending P5.7 delivery gates.

### US P5.2 — Preview and save Compose YAML and `.env`

As an operator, I can edit raw Compose YAML and `.env`, validate the result and
review an exact diff before saving it.

Acceptance criteria:

- Invalid YAML, invalid Compose structures and malformed `.env` assignments are rejected before any write.
- The preview contains separate Compose and `.env` diffs.
- The commit fails when either source file changed after preview.
- Writes are atomic per file and a failed multi-file commit is rolled back.
- Unsupported Compose keys and comments are preserved because the reviewed raw text is committed.

Status: completed locally; pending P5.7 delivery gates.

### US P5.3 — Create a managed stack

As an operator, I can create a stack beneath the active workspace, review its
files and either save it as a draft or deploy it.

Acceptance criteria:

- Stack names are lowercase and limited to `[a-z0-9_-]`.
- The destination cannot escape the active workspace.
- Existing directories or Compose files are never overwritten.
- The default document contains a usable example service.
- Creating and deploying remain separate, visible actions.

Status: completed locally; pending P5.7 delivery gates.

### US P5.4 — Manipulate a stack from the workspace

As an operator, I can start, stop, restart, update, down and deploy the selected
stack and see the command output.

Acceptance criteria:

- Every action uses the shared typed Compose command service.
- Destructive actions retain the existing explicit confirmation requirement.
- Update runs `pull`; it only recreates services when the stack was active.
- Deploy runs `up -d --remove-orphans` after a successful document commit.
- Output and diagnostics remain visible until the next action.

Status: completed locally; pending P5.7 delivery gates.

### US P5.5 — Delete an app-managed stack safely

As an operator, I can remove a stack created for Compose management after taking
it down and confirming the exact target.

Acceptance criteria:

- The API verifies the expected content hash and stack name.
- Only known Compose files and `.env` may be removed.
- A directory containing application source or any unrelated file is refused.
- No recursive deletion or broad workspace target is used.
- The UI requires typed-name confirmation and reports what was removed.

Status: completed locally; pending P5.7 delivery gates.

### US P5.6 — Prevent accidental edit loss

As an operator, I am warned before changing stack, view or browser location while
the Compose document contains unsaved edits.

Acceptance criteria:

- Browser unload is guarded while the editor is dirty.
- In-app discard returns to the last server version.
- Refreshing after a commit clears the dirty state.
- Stale previews cannot be committed.

Status: completed locally; pending P5.7 delivery gates.

### US P5.7 — Complete quality and delivery gates

As a maintainer, I can trust the feature because its domain, HTTP contract and UI
helpers are tested and the repository validation suite passes.

Acceptance criteria:

- New core modules meet the repository coverage thresholds.
- API authorization, validation and conflict responses are tested.
- `npm run validate` succeeds on Node.js 20.19 or later.
- A protected-branch PR passes GitHub Actions before merge.
- Documentation and release notes explain user-visible behavior and safety limits.

Status: local validation complete; protected-branch PR, CI and merge pending.

## Follow-up epic P6 — Interactive container PTY

Dockge's Bash button opens a bidirectional PTY over Socket.IO. Compose currently
has a deliberately non-interactive, local HTTP/SSE security model. A true PTY is
therefore tracked separately and is not emulated with unsafe arbitrary shell execution.

Required design work:

- threat model and explicit opt-in;
- WebSocket authentication and origin validation;
- fixed stack/service target resolution;
- shell allow-list and lifecycle cleanup;
- input, resize, disconnect and audit tests.

Until P6 is accepted, one-shot `docker compose exec` remains available through
the typed Commands view.

## Delivery sequence

1. P5.1–P5.2: application service, validation, optimistic concurrency and tests.
2. P5.3–P5.5: create/delete endpoints and safe lifecycle orchestration.
3. P5.4–P5.6: unified React page, actions, preview, output and edit guards.
4. P5.7: full local validation, PR, GitHub Actions observation and merge.

## Definition of done

An item is complete only when implementation, tests and documentation are in the
same branch, local validation is green, CI is green and the protected-branch PR
has been merged.
