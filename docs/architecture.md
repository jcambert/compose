# Architecture

## Intent

`compose` is a focused Node.js CLI that helps developers discover, inspect, execute and maintain Docker Compose projects from a terminal.

The architecture keeps a traditional separation between user interaction, domain logic, YAML handling and process execution. This makes the code easy to test and ready for future extensions such as templates, workspaces, favourites, generated documentation, remote execution, and a graphical interface.

A key product principle is that `compose` must guide the user when a command has meaningful options. For example, `compose up` should be able to ask whether the user wants detached mode, whether images should be built, and whether orphan containers should be removed. This guidance must be optional and must never remove scriptability.

## High-level modules

```text
src/
  cli/       maps terminal commands to application services
  prompts/   guided command questions and terminal prompt adapters
  scanner/   recursively discovers Compose files
  compose/   builds and executes docker compose commands
  project/   creates projects and mutates service definitions
  yaml/      parses, validates and writes Compose YAML documents
  utils/     common filesystem, path, logging and error helpers
```

The `prompts` module is intentionally separated from command execution. It asks questions and returns typed intent/options, but it does not execute Docker itself.

## Dependency direction

```text
cli
 ├─ prompts
 ├─ scanner
 ├─ compose
 ├─ project
 └─ yaml

prompts
 ├─ compose
 └─ project

project
 └─ yaml

scanner
 └─ yaml

compose
 └─ utils
```

The `cli` module is intentionally thin. It parses flags, asks interactive questions when needed, then delegates to modules that are independently testable.

The future GUI must reuse the same application services and command intent models as the CLI. The CLI must not contain business rules that a GUI would need to duplicate.

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

### Guided Compose execution

```text
User command
  -> cli command options
  -> command guidance policy
  -> prompt adapter asks missing or recommended questions
  -> typed ComposeExecutionRequest
  -> compose.buildComposeCommand(request)
  -> compose.executeComposeCommand(request)
  -> docker compose process
```

### Non-interactive Compose execution

```text
Script or CI command
  -> cli command options
  -> typed ComposeExecutionRequest
  -> compose.buildComposeCommand(request)
  -> compose.executeComposeCommand(request)
  -> docker compose process
```

### Project mutation

```text
User command
  -> parse existing compose.yaml
  -> optional guided service questions
  -> project service mutation
  -> zod validation
  -> YAML write
```

## Design decisions

- The external Docker Compose interface is invoked through `docker compose`, not reimplemented.
- `dockerode` is not the default execution layer because Docker Compose is a higher-level CLI workflow, while Dockerode primarily targets Docker Engine primitives.
- YAML is modified through parsed objects and validated models, not through fragile string replacement.
- Interactive behaviour is optional. Every important workflow must remain scriptable for CI and automation.
- Guided mode must be model-driven: prompts should be derived from command descriptors and option descriptors wherever possible.
- Command intent models must stay UI-neutral so a future GUI can render forms, toggles and confirmations from the same descriptors.

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
type CommandOptionDescriptor = {
  name: string;
  flag: string;
  description: string;
  valueType: 'boolean' | 'string' | 'string[]';
  defaultValue?: unknown;
  prompt?: {
    enabled: boolean;
    message: string;
    when: 'always' | 'missing' | 'recommended';
  };
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

- Add command descriptors for every Docker Compose command.
- Add guided prompt plans for common workflows.
- Add templates under `project/templates`.
- Add persistent favourites under `project-store`.
- Add richer Compose schema validation.
- Add Docker availability checks.
- Add TUI mode for long-running logs and project dashboards.
- Add a GUI on top of the same command descriptors and application services.
