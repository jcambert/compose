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
compose exec <service> [command...]
compose run <service> [command...]

compose project init <directory>
compose project add-service <service>
compose project remove-service <service>
compose project update-service <service>
compose project validate
```

## Common Compose options

```text
--project <path>       project directory or Compose file
--file <path>          explicit Compose file path
--project-name <name>  Docker Compose project name
--profile <profile>   Compose profile, repeatable
--dry-run              print generated command without executing it
```

## Command-specific options

### `compose up`

```text
-d, --detach
--remove-orphans
--build
--scale <service=count>
```

### `compose down`

```text
--remove-orphans
--volumes
```

### `compose logs`

```text
-f, --follow
--tail <lines>
```

### `compose build`

```text
--no-cache
--pull
```

### `compose run`

```text
--rm
-e, --env <key=value>
```

### `compose exec`

```text
-e, --env <key=value>
-u, --user <user>
-w, --workdir <path>
```

## Examples

```bash
compose scan .
compose scan . --json
compose scan C:\Sources --max-depth 8

compose up --project ./infra -d
compose logs --project ./infra api --follow --tail 100
compose exec --project ./infra api sh
compose run --project ./infra --rm worker npm run migrate
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
