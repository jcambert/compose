# Local UI Server and React GUI MVP

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

## React MVP

The root page serves a React-based MVP shell that consumes the local JSON API.

Initial UI sections:

- Doctor diagnostics
- Workspace status
- Stack list
- Stack detail
- Service runtime summary
- Docker Compose command preview
- Command execution result

The UI does not duplicate Docker Compose command generation. It posts command requests to the local API, then displays the generated `docker compose` command before execution.

The MVP keeps the implementation intentionally light and dependency-free for the npm package. It uses browser ESM imports for React while the backend, safety model and API contract are stabilized. A later packaging step can replace this with a bundled offline asset pipeline without changing the API contract.

The root page includes a visible fallback inside `#root` before React mounts. This avoids a fully blank page when browser JavaScript fails before the React app starts.

## Known MVP limitation

The current React MVP still depends on browser access to the React ESM imports used by the generated page. This means `compose ui` can still fail to render the React app in browsers that cannot reach or trust that external source.

This is an accepted MVP limitation only while the API and UX contract are being stabilized. The follow-up asset pipeline must remove this runtime browser dependency by serving local bundled assets from the npm package.

## Endpoints

```text
GET  /api/health
GET  /api/doctor
GET  /api/workspaces
GET  /api/stacks
GET  /api/stacks/:id/runtime
POST /api/commands/preview
POST /api/commands/execute
```

`GET /api/doctor` skips Docker checks by default so `compose ui` can start even when Docker is not running. Use `?skipDocker=false` to request Docker diagnostics.

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

## Safety constraints

The local UI server must remain local-only until a separate remote security design exists.

Current constraints:

- no remote bind
- no Electron or Tauri packaging
- no separate GUI command model
- no broad filesystem API
- no unauthenticated API route
- destructive command execution requires explicit confirmation data
- command preview is shown before execution

## Next step

The next GUI hardening step is to bundle local UI assets so `compose ui` can render without downloading browser dependencies. Filtering, richer service details and streaming logs/runtime updates can follow without changing the local API safety model.
