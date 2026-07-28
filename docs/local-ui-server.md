# Local UI Server

`compose ui` starts an optional browser-based local interface from the CLI.

This is the first GUI readiness step. It does not introduce React yet and it does not change the CLI-first product direction.

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

## Next step

The next GUI step is the React MVP. It should consume these endpoints instead of duplicating CLI or Docker Compose command logic.
