# Compose Command Surface

## Objective

`compose` is a typed, guided facade over `docker compose`. The CLI keeps the external Docker Compose execution model, but centralises command construction, dry-run previews, guided prompts and test coverage.

This command surface focuses on the most useful operational Docker Compose commands while keeping the implementation GUI-ready.

## Supported commands

### Stack lifecycle

```bash
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
```

### Inspection and diagnostics

```bash
compose ps [services...]
compose logs [services...]
compose config
compose events [services...]
compose images [services...]
compose ls
compose port <service> <private-port>
compose top [services...]
compose version
```

### Execution and file movement

```bash
compose exec [service] [command...]
compose run [service] [command...]
compose cp <source> <target>
```

### Development loop

```bash
compose build [services...]
compose pull [services...]
compose watch [services...]
```

## Browser command surface

`compose browse` now exposes the same operational surface through typed `ComposeExecutionRequest` values. The browser does not build Docker command strings directly; it collects menu decisions and prompt answers, then delegates to the same command builder as explicit CLI commands.

### Stack menu

```text
[Inspect] Services
[Inspect] Favorite
[Inspect] Refresh
[Inspect] Status      -> ps
[Inspect] Config      -> config
[Inspect] Images      -> images
[Inspect] Top         -> top
[Inspect] Version     -> version
[Lifecycle] Up        -> up -d
[Lifecycle] Create    -> create
[Lifecycle] Build     -> build
[Lifecycle] Start     -> start
[Lifecycle] Stop      -> stop
[Lifecycle] Pause     -> pause
[Lifecycle] Unpause   -> unpause
[Lifecycle] Restart   -> restart
[Tools] Logs          -> logs --tail 100
[Tools] Port          -> port <selected-service> <private-port>
[Tools] Copy file     -> cp <source> <target>
[Danger] Kill         -> kill [--signal]
[Danger] Remove       -> rm [--force] [--stop] [--volumes]
[Danger] Down         -> down
```

### Service menu

```text
[Inspect] Refresh
[Lifecycle] Up service       -> up -d <service>
[Lifecycle] Create service   -> create <service>
[Lifecycle] Build service    -> build <service>
[Lifecycle] Start service    -> start <service>
[Lifecycle] Stop service     -> stop <service>
[Lifecycle] Pause service    -> pause <service>
[Lifecycle] Unpause service  -> unpause <service>
[Lifecycle] Restart service  -> restart <service>
[Tools] Logs service         -> logs --tail 100 <service>
[Tools] Top service          -> top <service>
[Tools] Port service         -> port <service> <private-port>
[Tools] Shell                -> exec <service> sh
[Danger] Kill service        -> kill <service> [--signal]
[Danger] Remove service      -> rm <service> [--force] [--stop] [--volumes]
```

### Browser prompts and safety

- `down`, `kill` and `rm` require an explicit confirmation before a request is created.
- `kill` prompts for an optional `--signal` value.
- `rm` prompts for `--force`, `--stop` and `--volumes`.
- stack-level `port` asks for the target service when the stack has multiple services, then asks for the private container port.
- service-level `port` asks only for the private container port.
- `cp` asks for source and target paths.
- `--dry-run` prints the generated Docker command and does not execute Docker.

## Common options

Every command goes through the same global option handling:

```text
--project <path>       project directory or Compose file
--file <path>          explicit Compose file path
--project-name <name>  Docker Compose project name
--profile <profile>   Compose profile, repeatable
--guided              ask useful questions before execution
--yes                 accept safe guided defaults
--no-interactive      disable prompts
--dry-run             print the generated docker compose command
--no-ansi             disable ANSI output from Docker Compose
```

## Guided support

Guided descriptors now cover the command surface. Commands with useful or risky options expose explicit prompt descriptors. Destructive or operationally sensitive options are marked as destructive where applicable, notably `down --volumes`, `kill`, and `rm` options.

Examples:

```bash
compose rm --project ./infra --guided
compose config --project ./infra --guided --dry-run
compose port --project ./infra --guided
```

## Dry-run examples

```bash
compose kill --project ./infra api --signal SIGTERM --dry-run
# docker compose -f ./infra/compose.yaml kill --signal SIGTERM api

compose config --project ./infra --services --dry-run
# docker compose -f ./infra/compose.yaml config --services

compose cp --project ./infra api:/tmp/file.txt ./file.txt --dry-run
# docker compose -f ./infra/compose.yaml cp api:/tmp/file.txt ./file.txt
```

## Design notes

- `docker compose` remains the execution layer.
- Command registration stays in the CLI layer.
- Command building stays in the `compose` module.
- Guided questions stay descriptor-driven under `guided`.
- The browser keeps using typed `ComposeExecutionRequest` values instead of creating a separate menu-specific command model.
