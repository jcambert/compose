# Compose Workspace

The **Compose** section of `compose ui` provides a local workflow equivalent to
Dockge's Compose page while keeping the existing CLI and application-service
boundaries.

## Open and inspect a stack

1. Start the UI with `compose ui`.
2. Select a stack from **Stacks**.
3. Open **Compose** from the sidebar or use **Open Compose** in the stack detail.

The page shows:

- stack and service runtime states;
- service start, stop and restart actions;
- declared networks and safe `x-dockge.urls` links;
- the complete Compose file in a syntax-highlighted editor;
- the stack `.env` file;
- Docker Compose operation output and structured diagnostics.

The existing **Live streams** panel remains the combined terminal equivalent for
runtime events and `docker compose logs --follow`.

## Edit, save and deploy

Use **Edit stack**, change `compose.yaml` or `.env`, then select **Validate and
preview**. The server parses the YAML, validates the Compose schema and validates
environment variable declarations before returning a combined diff.

After reviewing the diff:

- **Save draft** writes the validated files without starting containers.
- **Deploy stack** writes the files and runs `docker compose up -d
  --remove-orphans`.
- **Discard** restores the last server version.

Both source files have independent content hashes. A commit is rejected with a
conflict when either file changed after the preview was generated. File
replacement is transactional and restores prior files if installation fails.

## Create a stack

Use **New stack**, enter a lowercase stack name and edit the default YAML. New
stacks are always created directly beneath the active workspace. Names are
limited to lowercase letters, numbers, underscores and hyphens, and an existing
directory is never overwritten.

The create flow uses the same preview, save-draft and deploy controls as an
existing stack.

## Lifecycle actions

The Compose page exposes the Dockge stack workflow through shared typed command
services:

- **Start**: `up -d --remove-orphans`;
- **Restart**: `restart`;
- **Update**: `pull`, followed by `up -d --remove-orphans` when the stack was active;
- **Stop**: `stop`;
- **Down**: `down` with destructive confirmation.

Commands never rebuild shell strings in the browser. They use the same command
builder, result type and diagnostics as the CLI.

## Safe deletion

Stack deletion requires the exact stack name. Compose first runs `down`, then
the server verifies the preview hash.

Because general workspaces may contain source repositories, deletion is
intentionally more conservative than Dockge's dedicated stacks directory. The
server only removes the selected Compose file and `.env`, and only when the
directory contains no other file or subdirectory. It never performs a recursive
delete.

## Guided editing and advanced editing

The existing **Services** section remains the recommended guided editor for
common fields. It preserves unsupported keys and requires a service-level diff.

The Compose workspace is the advanced whole-document editor for networks,
profiles, extensions, anchors and other Compose syntax. Both workflows operate
on the same real file and refresh after successful commits.

## Intentional boundary

Dockge's remote-agent model does not apply to this local-only product. A fully
interactive container PTY is tracked separately because it requires an explicit
WebSocket and shell-execution threat model. One-shot `docker compose exec`
commands remain available in **Commands**.
