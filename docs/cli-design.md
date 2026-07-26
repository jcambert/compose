# CLI Design

## Binary name

The npm binary is named `compose`.

Rationale: the user types a command, so adding `cli` to the binary name is redundant. The package may be scoped as `@jcambert/compose`, but the executable remains `compose`.

## Command groups

```text
compose scan [root]
compose select [root]

compose up [services...]
compose down
compose ps [services...]
compose logs [services...]
compose build [services...]
compose pull [services...]
compose restart [services...]
compose exec [service] [command...]
compose run [service] [command...]

compose project init <directory>
compose project add-service <service>
compose project remove-service <service>
compose project update-service <service>
compose project validate
```

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
compose scan .
compose scan . --json
compose scan C:\Sources --max-depth 8

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

`compose select` performs a recursive scan, lets the user choose a discovered project, then asks for the intended action.

Initial actions:

- `ps`
- `up -d`
- `logs --follow`
- `down`

## Scriptability rule

Interactive flows are convenient, but every action must be possible through explicit flags. This keeps the CLI usable in CI/CD, Makefiles, PowerShell scripts and developer automation.
