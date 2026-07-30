# Local UI Server and React GUI

`compose ui` starts an optional browser-based local interface from the CLI.

The primary product remains the CLI. The browser UI is a local adapter over the same application services and API endpoints used by the terminal workflow.

## Commands

```bash
compose ui
compose ui --port 0
compose ui --workspace dev
compose ui --no-open
compose ui --skip-docker
```

Behaviour:

- binds to `127.0.0.1`
- uses a free dynamic port by default
- generates a short-lived local token
- opens the browser unless `--no-open` is used
- keeps the terminal process alive until `Ctrl+C`

The URL contains the local token:

```text
http://127.0.0.1:<port>/?token=<token>
```

API clients can also send the token with:

```text
Authorization: Bearer <token>
```

## Bundled React UI

The root page serves a React-based UI shell from bundled local assets under `dist/ui`.

Build output:

```text
dist/ui/index.html
dist/ui/assets/*
```

The browser does not download React from an external ESM/CDN source at runtime. `compose ui` serves the bundled `index.html` and `/assets/*` files from the npm package or from a local source build.

The root page includes a visible fallback inside `#root` before React mounts. If bundled assets are missing from a source checkout, the server returns a visible fallback page explaining that `npm run build` must be run.

## Professional layout

The local UI is organized as a small admin console instead of a single technical page.

Main areas:

- Dashboard overview with workspace, stack, service, doctor and runtime summary cards.
- Sidebar navigation for Dashboard, Workspaces, Stacks, Doctor and Commands.
- Top bar showing the current workspace, local server state and refresh action.
- Workspace management with create, edit-path, select-current and confirmed remove actions.
- Stack browser with client-side search and sorting.
- Stack detail panel with services, runtime status, ports and container names when available.
- Command workflow with a clear preview, confirmation and execution sequence.
- Command execution diagnostics for unavailable Docker, missing Compose files and non-zero Docker Compose failures.
- Live streams panel for runtime updates and Docker Compose logs.
- Professional loading, empty and error states.

The UI still does not duplicate Docker Compose command generation. It posts command requests to the local API, then displays the generated `docker compose` command before execution.

## Endpoints

```text
GET    /api/health
GET    /api/doctor
GET    /api/workspaces
POST   /api/workspaces
POST   /api/workspaces/current
DELETE /api/workspaces/:name
GET    /api/stacks
GET    /api/stacks/:id/runtime
GET    /api/events/runtime
GET    /api/logs/stream
POST   /api/commands/preview
POST   /api/commands/execute
```

`GET /api/doctor` skips Docker checks by default so `compose ui` can start even when Docker is not running. Use `?skipDocker=false` to request Docker diagnostics.

## Workspace management

The local UI can manage saved workspaces from the browser. The same local token protection applies to read and write endpoints. The workspace panel keeps destructive remove actions behind an explicit confirmation and uses the same save endpoint to update an existing workspace path.

Create or update a workspace:

```http
POST /api/workspaces
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "dev",
  "path": "C:\Sources"
}
```

Select the current workspace:

```http
POST /api/workspaces/current
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "dev"
}
```

Remove a saved workspace:

```http
DELETE /api/workspaces/dev
Authorization: Bearer <token>
```

Each mutation returns the refreshed workspace list so the browser can update its state and rescan stacks from the new current workspace.

`GET /api/stacks` resolves the scan root in this order:

1. `root` query parameter
2. `workspace` query parameter
3. `--workspace` option passed to `compose ui`
4. current workspace from local config
5. current directory

Examples:

```text
GET /api/stacks?root=C:\Sources
GET /api/stacks?workspace=dev
GET /api/stacks?maxDepth=6
```

## Streaming

The local UI exposes read-only Server-Sent Events streams for live runtime and log updates.

```text
GET /api/events/runtime?stackId=<stack-id>&intervalMs=5000
GET /api/logs/stream?stackId=<stack-id>&service=<service>&tail=200
```

Runtime streaming periodically reuses the same runtime status reader used by the stack detail panel. Log streaming runs:

```bash
docker compose -f <compose-file> logs --follow --tail <tail> [service]
```

The log child process is stopped when the browser closes the stream or the user stops streaming from the UI. See [`docs/gui-streaming.md`](gui-streaming.md) for the detailed event contract.

## Command preview

```http
POST /api/commands/preview
Authorization: Bearer <token>
Content-Type: application/json

{
  "command": "ps",
  "composeFilePath": "C:\Sources\infra\compose.yaml",
  "services": [],
  "options": {}
}
```

The response is the generated Docker Compose command model:

```json
{
  "binary": "docker",
  "args": ["compose", "-f", "C:\Sources\infra\compose.yaml", "ps"],
  "cwd": "C:\Sources\infra",
  "displayCommand": "docker compose -f C:\Sources\infra\compose.yaml ps"
}
```

## Command execution

Execution requires explicit confirmation:

```json
{
  "command": "ps",
  "composeFilePath": "C:\Sources\infra\compose.yaml",
  "services": [],
  "options": {},
  "confirmed": true
}
```

Destructive commands require an additional flag:

```json
{
  "command": "down",
  "composeFilePath": "C:\Sources\infra\compose.yaml",
  "services": [],
  "options": {},
  "confirmed": true,
  "destructiveConfirmed": true
}
```

Destructive commands currently include:

```text
down
kill
rm
```

Execution responses keep the generated command, exit code, stdout and stderr. Failed executions can also include a `diagnostic` object:

```text
kind
title
message
command
workingDirectory
composeFilePath
exitCode
hints
stdout
stderr
```

The diagnostic model is shared with the CLI execution path and currently covers unavailable Docker, missing Compose files and generic non-zero Docker Compose command failures. See [`docs/compose-error-reporting.md`](compose-error-reporting.md) for details.

The browser UI makes this flow explicit: preview first, normal confirmation second, destructive confirmation third when the selected command requires it. Live streams are read-only and do not bypass command confirmation rules.

## Safety constraints

The local UI server must remain local-only until a separate remote security design exists.

Current constraints:

- no remote bind
- no Electron or Tauri packaging
- no separate GUI command model
- no broad filesystem API
- no unauthenticated API route
- workspace mutation endpoints stay token-protected and local-only
- streaming endpoints stay token-protected and read-only
- command diagnostics are read-only and preserve raw Docker Compose output
- destructive command execution requires explicit confirmation data
- command preview is shown before execution

## Next step

The next project step is preparing the post-`v0.2.0` release, likely `v0.2.1`.

## Guided service editing

The local UI exposes stack-scoped, token-protected endpoints:

- `GET /api/stacks/{stackId}/services`
- `POST /api/stacks/{stackId}/services/preview`
- `POST /api/stacks/{stackId}/services/commit`

The browser editor supports guided create, update and delete operations. It never writes immediately: the user first generates and reviews a YAML diff, explicitly confirms it, and only then commits. The application service content hash prevents saving a stale preview after the file changed on disk. Advanced and unsupported service keys are preserved.
