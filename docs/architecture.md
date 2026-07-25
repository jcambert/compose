# Architecture

## Intent

`compose` is a focused Node.js CLI that helps developers discover, inspect, execute and maintain Docker Compose projects from a terminal.

The architecture keeps a traditional separation between user interaction, domain logic, YAML handling and process execution. This makes the code easy to test and ready for future extensions such as templates, workspaces, favourites, generated documentation or remote execution.

## High-level modules

```text
src/
  cli/       maps terminal commands to application services
  scanner/   recursively discovers Compose files
  compose/   builds and executes docker compose commands
  project/   creates projects and mutates service definitions
  yaml/      parses, validates and writes Compose YAML documents
  utils/     common filesystem, path, logging and error helpers
```

## Dependency direction

```text
cli
 ├─ scanner
 ├─ compose
 ├─ project
 └─ yaml

project
 └─ yaml

scanner
 └─ yaml

compose
 └─ utils
```

The `cli` module is intentionally thin. It parses flags, asks interactive questions when needed, then delegates to modules that are independently testable.

## Main data flow

### Discovery

```text
User command
  -> cli scan command
  -> scanner.scanComposeFiles(root)
  -> yaml.parseComposeDocument(file)
  -> DiscoveredComposeProject[]
  -> terminal output or JSON
```

### Compose execution

```text
User command
  -> cli command options
  -> resolve compose file path
  -> compose.buildComposeCommand(request)
  -> compose.executeComposeCommand(request)
  -> docker compose process
```

### Project mutation

```text
User command
  -> parse existing compose.yaml
  -> project service mutation
  -> zod validation
  -> YAML write
```

## Design decisions

- The external Docker Compose interface is invoked through `docker compose`, not reimplemented.
- `dockerode` is not the default execution layer because Docker Compose is a higher-level CLI workflow, while Dockerode primarily targets Docker Engine primitives.
- YAML is modified through parsed objects and validated models, not through fragile string replacement.
- Interactive behaviour is optional. Every important workflow must remain scriptable for CI and automation.

## Core types

```ts
type DiscoveredComposeProject = {
  id: string;
  name: string;
  composeFilePath: string;
  directoryPath: string;
  relativePath: string;
  services: string[];
  warnings: string[];
};
```

```ts
type ComposeExecutionRequest = {
  composeFilePath: string;
  workingDirectory?: string;
  command: ComposeSubCommand;
  services: string[];
  options: ComposeCommandOptions;
  passthroughArgs: string[];
};
```

```ts
type ComposeDocument = {
  name?: string;
  services: Record<string, ComposeService>;
  networks?: Record<string, unknown>;
  volumes?: Record<string, unknown>;
  configs?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
};
```

## Extension points

- Add templates under `project/templates`.
- Add persistent favourites under `project-store`.
- Add richer Compose schema validation.
- Add Docker availability checks.
- Add TUI mode for long-running logs and project dashboards.
