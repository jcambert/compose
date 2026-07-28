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
  "path": "C:\\Sources"
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

## Command preview

```http
POST /api/commands/preview
Authorization: Bearer <token>
Content-Type: application/json

{
  "command": "ps",
  "composeFilePath": "C:\\Sources\\infra\\compose.yaml",
  "services": [],
  "options": {}
}
```

The response is the generated Docker Compose command model:

```json
{
  "binary": "docker",
  "args": ["compose", "-f", "C:\\Sources\\infra\\compose.yaml", "ps"],
  "cwd": "C:\\Sources\\infra",
  "displayCommand": "docker compose -f C:\\Sources\\infra\\compose.yaml ps"
}
```

## Command execution

Execution requires explicit confirmation:

```json
{
  "command": "ps",
  "composeFilePath": "C:\\Sources\\infra\\compose.yaml",
  "services": [],
  "options": {},
  "confirmed": true
}
```

Destructive commands require an additional flag:

```json
{
  "command": "down",
  "composeFilePath": "C:\\Sources\\infra\\compose.yaml",
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

The browser UI makes this flow explicit: preview first, normal confirmation second, destructive confirmation third when the selected command requires it.

## Safety constraints

The local UI server must remain local-only until a separate remote security design exists.

Current constraints:

- no remote bind
- no Electron or Tauri packaging
- no separate GUI command model
- no broad filesystem API
- no unauthenticated API route
- workspace mutation endpoints stay token-protected and local-only
- destructive command execution requires explicit confirmation data
- command preview is shown before execution

## Next step

The next GUI hardening step is streaming logs/runtime updates through Server-Sent Events. Richer command error reporting can follow without changing the local API safety model.
