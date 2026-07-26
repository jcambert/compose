# CLI Design

## Binary name

The npm binary is named `compose`.

Rationale: the user types a command, so adding `cli` to the binary name is redundant. The package may be scoped as `@jcambert/compose`, but the executable remains `compose`.

## Command groups

```text
compose scan [root]
compose select [root]
compose browse [root]
compose stacks [root]

compose workspace add <name> <path>
compose workspace remove <name>
compose workspace use <name>
compose workspace list
compose workspace current

compose favorites add <stack>
compose favorites remove <stack>
compose favorites list

compose up [services...]
compose down
compose create [services...]
compose start [services...]
compose stop [services...]
compose restart [services...]
compose pause [services...]
compose unpause [services...]
compose kill [services...]
compose rm [services...]
compose ps [services...]
compose logs [services...]
compose build [services...]
compose pull [services...]
compose config
compose cp <source> <target>
compose events [services...]
compose images [services...]
compose ls
compose port <service> <private-port>
compose top [services...]
compose version
compose watch [services...]
compose exec [service] [command...]
compose run [service] [command...]

compose project init <directory>
compose project add-service <service>
compose project remove-service <service>
compose project update-service <service>
compose project validate
```

`compose stacks` is an alias for `compose browse`.

When `compose browse` is called without `[root]`, it uses the current workspace root. If no workspace is configured, it falls back to `.`.

`exec` and `run` accept an omitted service only when `--guided` is used. Without guided resolution, Docker Compose still needs a service name.

## Common Compose options

```text
--project <path>       project directory or Compose file
--file <path>          explicit Compose file path
--project-name <name>  Docker Compose project name
--profile <profile>   Compose profile, repeatable
--guided              ask useful questions before executing the command
--yes                 accept safe guided defaults and do not ask questions
--dry-run             print generated command without executing it
--no-interactive      disable all prompts and fail when guidance would be required
```

## Workspaces and favorites

Workspaces are named local scan roots persisted in a user config file. Favorites are stack references scoped to a workspace.

```bash
compose workspace add dev C:\Sources
compose workspace use dev
compose browse
```

Config location:

```text
Windows:     %APPDATA%\compose\config.json
Linux/macOS: ~/.config/compose/config.json
```

Workspace command behaviour:

- `workspace add` creates or updates a named root and sets it as current when no current workspace exists.
- `workspace use` changes the current workspace.
- `workspace remove` removes favorites and recent stacks associated with the removed workspace.
- `workspace current` prints the selected workspace.
- `workspace list` marks the current workspace with `*`.

Favorite command behaviour:

- `favorites add <stack>` resolves `<stack>` by scanning the current workspace and matching stack name, id, relative path or compose file path.
- `favorites remove <stack>` removes a favorite by stack name, relative path or compose file path.
- `favorites list` shows favorites for the current workspace.

The browser can also toggle a stack as favorite from the stack menu. Favorite stacks are displayed first and rendered with `★`.

## Guided mode

The CLI can guide the user for each command and its options.

Guided mode is designed for humans. Scripted mode is designed for CI, Makefiles and automation. Both modes resolve to the same typed command request before execution.

Examples:

```bash
compose up --project ./infra --guided
```

Possible questions:

```text
Start containers in detached mode? Yes
Build images before starting? No
Remove orphan containers? Yes
Scale services? api=2
```

Resulting command:

```bash
compose up --project ./infra --detach --remove-orphans --scale api=2
```

Equivalent Docker command:

```bash
docker compose -f ./infra/compose.yaml up -d --remove-orphans --scale api=2
```

## Guidance rules

- If `--guided` is not provided, `compose` does not ask optional questions.
- If `--guided` is provided, `compose` asks useful option questions and resolves missing command details when possible.
- If `--guided --yes` is provided, `compose` applies safe descriptor defaults and does not ask questions.
- If `--guided --no-interactive` is provided, the command fails because the requested behaviour is contradictory.
- If a Compose file can be parsed, guided service selection uses the service names from the file.
- If a required service is missing and no service list is available, guided mode asks for a service name as text.
- The final resolved request remains printable with `--dry-run`.

## Interactive stack browser

`compose browse [root]` scans a root directory, displays discovered stacks, then lets the user navigate interactively across stack-level and service-level actions.

Alias:

```bash
compose stacks .
```

Browser options:

```text
--max-depth <depth>    maximum recursive scan depth
--project-name <name>  Docker Compose project name
--profile <profile>   Compose profile, repeatable
--dry-run             print generated Docker commands without executing them
--no-ansi             disable ANSI output from docker compose
```

Stack-level actions are grouped by category:

- Inspect: services, favorite, refresh, `ps`, `config`, `images`, `top`, `version`.
- Lifecycle: `up -d`, `create`, `build`, `start`, `stop`, `pause`, `unpause`, `restart`.
- Tools: `logs --tail 100`, `port <service> <private-port>`, `cp <source> <target>`.
- Danger: `kill`, `rm`, `down`.

Service-level actions are the same operational model scoped to one service:

- Lifecycle: `up -d <service>`, `create <service>`, `build <service>`, `start <service>`, `stop <service>`, `pause <service>`, `unpause <service>`, `restart <service>`.
- Tools: `logs --tail 100 <service>`, `top <service>`, `port <service> <private-port>`, `exec <service> sh`.
- Danger: `kill <service>`, `rm <service>`.

Browser prompt rules:

- `down`, `kill` and `rm` require explicit confirmation.
- `kill` prompts for an optional `--signal`.
- `rm` prompts for `--force`, `--stop` and `--volumes`.
- stack-level `port` prompts for service selection when several services are available and always prompts for the private port.
- `cp` prompts for source and target paths.

The browser is a terminal UX on top of the same scan and Compose execution primitives. It must not become the only way to perform an action; every generated action should remain scriptable through explicit commands.

## Command-specific options

### `compose up`

```text
-d, --detach
--remove-orphans
--build
--scale <service=count>
```

Guided questions:

- Start containers in detached mode?
- Build images before starting?
- Remove orphan containers?
- Scale one or more services?

### `compose down`

```text
--remove-orphans
--volumes
```

Guided questions:

- Remove orphan containers?
- Remove named volumes? This is presented as a destructive option.

### `compose logs`

```text
-f, --follow
--tail <lines>
```

Guided questions:

- Select one or more services, or leave empty for all services.
- Follow log output?
- Limit log lines?

### `compose build`

```text
--no-cache
--pull
```

Guided questions:

- Select one or more services, or leave empty for all services.
- Build without cache?
- Pull newer base images before building?

### `compose run`

```text
--rm
-e, --env <key=value>
```

Guided questions:

- Select the service when it was not provided on the command line.
- Provide the command to run, or leave empty for the service default command.
- Remove the container after run?
- Add environment variables?

### `compose exec`

```text
-e, --env <key=value>
-u, --user <user>
-w, --workdir <path>
```

Guided questions:

- Select the service when it was not provided on the command line.
- Provide the command to execute, defaulting to `sh`.
- Add environment variables?
- Run as a specific user?
- Use a specific working directory?

## Examples

```bash
compose workspace add dev C:\Sources
compose workspace use dev
compose browse
compose favorites add infra
compose favorites list

compose scan .
compose scan . --json
compose scan C:\Sources --max-depth 8
compose browse .
compose stacks C:\Sources --max-depth 6 --dry-run

compose up --project ./infra -d
compose up --project ./infra --guided
compose up --project ./infra --guided --yes --dry-run
compose logs --project ./infra --guided
compose exec --project ./infra --guided
compose run --project ./infra --guided
compose down --project ./infra --guided
compose down --project ./infra --remove-orphans
```

## Interactive mode

`compose select` remains a lightweight selector for quick project/action selection.

`compose browse` is the richer interactive workflow. It is the preferred terminal experience for moving across stacks, drilling into services and executing operational actions without memorising or retyping commands.

## Scriptability rule

Interactive flows are convenient, but every action must be possible through explicit flags. This keeps the CLI usable in CI/CD, Makefiles, PowerShell scripts and developer automation.
