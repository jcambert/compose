# Architecture

## Intent

`compose` is a focused Node.js CLI that helps developers discover, inspect, execute and maintain Docker Compose projects from a terminal.

The architecture keeps a traditional separation between user interaction, domain logic, YAML handling and process execution. This makes the code easy to test and ready for future extensions such as templates, workspaces, favourites, generated documentation, remote execution, and a graphical interface.

A key product principle is that `compose` must guide the user when a command has meaningful options. For example, `compose up` can ask whether the user wants detached mode, whether images should be built, and whether orphan containers should be removed. This guidance is optional and never removes scriptability.

A second product principle is that users can browse discovered stacks interactively. The browser is a terminal workflow over the same scan and execution primitives: it lists stacks, lets the user drill into services, and generates normal typed Compose execution requests.

## High-level modules

```text
src/
  cli/          maps terminal commands to application services and terminal adapters
  guided/       UI-neutral command descriptors and guided option resolution
  interactive/  interactive stack and service browsing workflows
  scanner/      recursively discovers Compose files
  compose/      builds and executes docker compose commands
  project/      creates projects and mutates service definitions
  yaml/         parses, validates and writes Compose YAML documents
  utils/        common filesystem, path, logging and error helpers
```

The `guided` module is intentionally separated from terminal rendering. It describes command questions and resolves typed options, but it does not import Inquirer and does not execute Docker. The terminal adapter lives under `cli`, and a future GUI can provide another adapter over the same descriptors.

The `interactive` module owns the stack/service browsing workflow. It scans for stacks, builds menus from discovered projects and services, and resolves menu selections into typed `ComposeExecutionRequest` values. It accepts prompt and execution dependencies so tests and future frontends can reuse the workflow without coupling it to a specific terminal renderer.

## Dependency direction

```text
cli
 ├─ guided
 ├─ interactive
 ├─ scanner
 ├─ compose
 ├─ project
 └─ yaml

guided
 └─ compose

interactive
 ├─ scanner
 ├─ compose
 └─ guided prompt contracts

project
 └─ yaml

scanner
 └─ yaml

compose
 └─ utils
```

The `cli` module is intentionally thin. It parses flags, asks interactive questions through an adapter when needed, then delegates to modules that are independently testable.

The future GUI must reuse the same application services, command descriptors, browser workflows and command intent models as the CLI. The CLI must not contain business rules that a GUI would need to duplicate.

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

### Interactive stack browsing

```text
User command
  -> cli browse command
  -> interactive.browseComposeStacks(root)
  -> scanner.scanComposeFiles(root)
  -> prompt adapter selects stack
  -> prompt adapter selects stack or service action
  -> typed ComposeExecutionRequest
  -> compose.buildComposeCommand(request)
  -> compose.executeComposeCommand(request)
  -> return to browser menu
```

### Guided Compose execution

```text
User command
  -> cli command options
  -> guided.getGuidedCommandDescriptor(command)
  -> prompt adapter asks missing or recommended questions
  -> guided.resolveGuidedCommand(...)
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
- The stack browser is a convenience workflow that produces normal Compose execution requests instead of a separate command model.
- Guided mode is model-driven: prompts are derived from command descriptors and option descriptors wherever possible.
- Command intent models stay UI-neutral so a future GUI can render forms, toggles and confirmations from the same descriptors.

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
type StackBrowserOptions = {
  maxDepth?: number;
  dryRun?: boolean;
  noAnsi?: boolean;
  projectName?: string;
  profile?: string[];
};
```

```ts
type GuidedOptionDescriptor = {
  key: keyof ComposeCommandOptions;
  flag: string;
  description: string;
  valueType: 'boolean' | 'string' | 'string[]';
  promptKind: 'confirm' | 'input';
  message: string;
  defaultValue?: unknown;
  safeDefault?: unknown;
  destructive?: boolean;
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
- Add guided prompt plans for project management commands.
- Add GUI components that render forms from guided descriptors and stack browser workflows.
- Add templates under `project/templates`.
- Add persistent favourites under `project-store`.
- Add richer Compose schema validation.
- Add Docker availability checks.
- Add TUI mode for long-running logs and project dashboards.
