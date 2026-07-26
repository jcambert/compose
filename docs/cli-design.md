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
--guided              ask useful questions before executing the command
--yes                 accept safe defaults and do not ask confirmation questions
--dry-run             print generated command without executing it
--no-interactive      disable all prompts, fail when required data is missing
```

## Guided mode

The CLI must be able to guide the user for each command and its options.

Guided mode is designed for humans. Scripted mode is designed for CI, Makefiles and automation. Both modes must resolve to the same typed command request before execution.

Examples:

```bash
compose up --project ./infra --guided
```

Possible questions:

```text
Start in detached mode? Yes
Build images before starting? No
Remove orphan containers? Yes
Scale a service? No
```

Resulting command:

```bash
compose up --project ./infra --detach --remove-orphans
```

Equivalent Docker command:

```bash
docker compose -f ./infra/compose.yaml up -d --remove-orphans
```

## Guidance rules

- If the command is explicitly non-interactive, never ask questions.
- If `--guided` is provided, ask useful option questions even when defaults exist.
- If required data is missing in an interactive terminal, ask for it.
- If required data is missing in non-interactive mode, fail with a clear error.
- If `--yes` is provided, use safe defaults without asking confirmation questions.
- The final resolved request must be printable with `--dry-run`.

## Command-specific options

### `compose up`

```text
-d, --detach
--remove-orphans
--build
--scale <service=count>
```

Guided questions:

- Start in detached mode?
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
- Remove named volumes? This should be presented as a destructive option.

### `compose logs`

```text
-f, --follow
--tail <lines>
```

Guided questions:

- Follow log output?
- Limit log lines?
- Select one or more services?

### `compose build`

```text
--no-cache
--pull
```

Guided questions:

- Build without cache?
- Pull newer base images before building?

### `compose run`

```text
--rm
-e, --env <key=value>
```

Guided questions:

- Remove the container after run?
- Add environment variables?
- Provide the command to run?

### `compose exec`

```text
-e, --env <key=value>
-u, --user <user>
-w, --workdir <path>
```

Guided questions:

- Select the service.
- Provide the command to execute.
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

`compose select` should evolve into a guided command launcher. The user should be able to choose a project, choose a command, answer command-specific questions, preview the generated command, then execute it.

## GUI readiness rule

Prompt logic must not be hardcoded only in terminal commands. Each command should expose descriptors that can be used by:

- the CLI prompt layer;
- documentation generation;
- future GUI forms;
- tests;
- dry-run previews.

A future GUI should not need to reverse-engineer CLI flags. It should consume command descriptors, option descriptors and application services directly.

## Scriptability rule

Interactive flows are convenient, but every action must be possible through explicit flags. This keeps the CLI usable in CI/CD, Makefiles, PowerShell scripts and developer automation.
