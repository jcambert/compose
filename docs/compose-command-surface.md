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
- The browser keeps using typed `ComposeExecutionRequest` values so more actions can be added without creating a separate command model.
