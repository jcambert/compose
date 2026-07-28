# Docker Compose Error Reporting

`compose` keeps Docker Compose as the execution layer, but normalizes command failures into a small diagnostic model that can be reused by the CLI, application services and the optional local UI.

The goal is not to hide Docker Compose output. The goal is to make failures easier to understand before the user has to inspect raw process output.

## Diagnostic model

Every command execution result keeps the existing execution fields:

```text
command
exitCode
stdout
stderr
```

Failed executions can also include a `diagnostic` object:

```text
kind
  docker-unavailable
  compose-file-missing
  compose-command-failed

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

The diagnostic preserves the generated command, working directory, Compose file path, exit code and raw process output so troubleshooting does not require reconstructing the execution context.

## Failure kinds

### `docker-unavailable`

Used when the `docker` executable cannot be started, for example when Docker Desktop or Docker Engine is not installed, not running, or not available in `PATH`.

Typical hints:

- Check that Docker Desktop or Docker Engine is installed and running.
- Check that the `docker` command is available in `PATH` for the current terminal/session.
- Run `compose doctor` for local installation diagnostics.

### `compose-file-missing`

Used when Docker Compose cannot read the selected Compose file.

Typical hints:

- Check that the selected stack still exists on disk.
- Refresh the workspace scan before executing the command again.
- Check the configured workspace path if the file was moved or deleted.

### `compose-command-failed`

Used for other non-zero Docker Compose command results.

Typical hints:

- Review `stderr` and `stdout` for the Docker Compose error details.
- Check that Docker is running and the selected services exist in the Compose file.
- Run the generated command manually when deeper Docker troubleshooting is required.

## Terminal behaviour

When commands use the default Docker runner, the terminal continues to stream Docker Compose output normally. If the command fails, `compose` also prints a normalized diagnostic summary and sets the process exit code to the Docker Compose exit code.

This keeps existing terminal behaviour while adding actionable context.

## Local UI behaviour

The local UI receives the same execution result model from `/api/commands/execute`. The diagnostic is part of the JSON result, next to the generated command, exit code, stdout and stderr.

Command execution remains behind preview and confirmation. Error reporting does not bypass destructive-command safeguards.

## Scope

This feature intentionally does not:

- reimplement Docker Compose errors
- suppress raw Docker Compose output
- retry failed Docker commands automatically
- introduce a GUI-specific error model

The CLI and UI keep sharing the same command execution and diagnostic model.
