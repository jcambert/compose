# Architecture

## Intent

`compose` is a focused Node.js CLI that helps developers discover, inspect, execute and maintain Docker Compose projects from a terminal.

The architecture keeps a traditional separation between user interaction, domain logic, YAML handling, workspace persistence and process execution. This makes the code easy to test and ready for future extensions such as workspaces, favourites, generated documentation, remote execution experiments, and an optional graphical interface.

A key product principle is that `compose` must guide the user when a command has meaningful options. For example, `compose up` can ask whether the user wants detached mode, whether images should be built, and whether orphan containers should be removed. This guidance is optional and never removes scriptability.

A second product principle is that users can browse discovered stacks interactively. The browser is a terminal workflow over the same scan and execution primitives: it lists stacks, lets the user drill into services, and generates normal typed Compose execution requests.

A third product principle is daily usability. Named workspaces, favorites and recent stacks are stored locally so the user can run `compose browse` without retyping the same root directory every day.

A fourth product principle is CLI-first GUI readiness. A future GUI must be launched by the CLI, reuse the same application services, and remain optional.

## High-level modules

```text
src/
  cli/          maps terminal commands to application services and terminal adapters
  guided/       UI-neutral command descriptors and guided option resolution
  interactive/  interactive stack and service browsing workflows
  scanner/      recursively discovers Compose files
  compose/      builds and executes docker compose commands
  project/      creates projects and mutates service definitions
  workspace/    stores local workspaces, favorites and recent stacks
  yaml/         parses, validates and writes Compose YAML documents
  utils/        common filesystem, path, logging and error helpers
```

The `guided` module is intentionally separated from terminal rendering. It describes command questions and resolves typed options, but it does not import Inquirer and does not execute Docker. The terminal adapter lives under `cli`, and a future GUI can provide another adapter over the same descriptors.

The `interactive` module owns the stack/service browsing workflow. It scans for stacks, builds menus from discovered projects and services, displays runtime status and resolves menu selections into typed `ComposeExecutionRequest` values. It accepts prompt, execution, runtime and favorite dependencies so tests and future frontends can reuse the workflow without coupling it to a specific terminal renderer.

The `workspace` module owns local configuration. It resolves the user config path, loads/saves JSON, normalizes older or partial config files, manages named roots, stores workspace-scoped favorite stacks and records recent stack selections. It does not import terminal prompts.

## Planned GUI-ready module evolution

The next architectural evolution is to formalize a reusable application service layer before adding the optional GUI.

Target direction:

```text
src/
  app/           reusable application services shared by CLI and GUI
  cli/           terminal adapter and command registration
  compose/       Docker Compose command model, builder and executor
  doctor/        diagnostics model and runner
  guided/        UI-neutral command descriptors
  interactive/   stack/service browsing workflow
  scanner/       Compose discovery
  ui-server/     local HTTP server for compose ui
  workspace/     local workspaces, favorites and recents
  yaml/          Compose YAML parser/writer
```

This must be done incrementally. The project should not be reorganized into a large monorepo or desktop application before the local CLI-launched GUI MVP proves useful.

## Dependency direction

```text
cli
 ├─ guided
 ├─ interactive
 ├─ scanner
 ├─ compose
 ├─ project
 ├─ workspace
 └─ yaml

guided
 └─ compose

interactive
 ├─ scanner
 ├─ compose
 └─ guided prompt contracts

workspace
 └─ scanner data contracts

project
 └─ yaml

scanner
 └─ yaml

compose
 └─ utils
```

The `cli` module is intentionally thin. It parses flags, asks interactive questions through an adapter when needed, then delegates to modules that are independently testable.

The future GUI must reuse the same application services, command descriptors, browser workflows, workspace store and command intent models as the CLI. The CLI must not contain business rules that a GUI would need to duplicate.

## GUI architecture stance

The planned GUI is a local browser-based interface served by the CLI through `compose ui`.

It should use:

- React + Vite + TypeScript for the UI.
- Fastify or a minimal Node HTTP server for the local API.
- Server-Sent Events for logs and runtime status updates when streaming is introduced.
- `127.0.0.1` binding by default.
- A dynamic port by default.
- A short-lived local token for API access.

Electron, Tauri and desktop packaging are not part of the first GUI iterations. They can be reconsidered only after the local browser-based GUI proves valuable.

See `docs/gui-roadmap.md` for the delivery plan and safety rules.

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

### Workspace-backed browsing

```text
User command
  -> cli browse command without root
  -> workspace.load config
  -> resolve current workspace root
  -> interactive.browseComposeStacks(root, favorites)
  -> scanner.scanComposeFiles(root)
  -> runtime status reader
  -> favorites sorted first
  -> prompt adapter selects stack
  -> optional workspace favorite/recent update
  -> prompt adapter selects stack or service action
  -> typed ComposeExecutionRequest
  -> compose.buildComposeCommand(request)
  -> compose.executeComposeCommand(request)
  -> return to browser menu
```

### Interactive stack browsing with explicit root

```text
User command
  -> cli browse command with root
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

### Future local GUI

```text
User command
  -> compose ui
  -> local server on 127.0.0.1
  -> browser UI
  -> local JSON API
  -> reusable application service
  -> scanner / doctor / workspace / compose module
  -> typed response or ComposeExecutionRequest preview
```

## Design decisions

- The external Docker Compose interface is invoked through `docker compose`, not reimplemented.
- `dockerode` is not the default execution layer because Docker Compose is a higher-level CLI workflow, while Dockerode primarily targets Docker Engine primitives.
- YAML is modified through parsed objects and validated models, not through fragile string replacement.
- Interactive behaviour is optional. Every important workflow must remain scriptable for CI and automation.
- The stack browser is a convenience workflow that produces normal Compose execution requests instead of a separate command model.
- Workspace and favorite persistence is local JSON, isolated from prompt rendering and Docker execution.
- Guided mode is model-driven: prompts are derived from command descriptors and option descriptors wherever possible.
- Command intent models stay UI-neutral so a future GUI can render forms, toggles and confirmations from the same descriptors.
- The GUI must be launched from the CLI and remain optional.
- The GUI must not create a separate command model or configuration format.
- Destructive actions must remain explicit in both terminal and GUI workflows.

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
  workspaceName?: string;
  favoriteStackIds?: string[];
};
```

```ts
type WorkspaceConfig = {
  version: 1;
  currentWorkspaceName?: string;
  workspaces: Record<string, WorkspaceDefinition>;
  favoriteStacks: FavoriteStack[];
  recentStacks: RecentStack[];
};
```

```ts
type FavoriteStack = {
  workspaceName: string;
  stackId: string;
  stackName: string;
  relativePath: string;
  composeFilePath: string;
  createdAt: string;
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

- Formalize reusable application services for CLI and GUI adapters.
- Add command descriptors for every Docker Compose command.
- Add guided prompt plans for project management commands.
- Add GUI components that render forms from guided descriptors, workspace config and stack browser workflows.
- Add workspace import/export.
- Add richer Compose schema validation.
- Add Docker availability checks.
- Add TUI mode for long-running logs and project dashboards.
- Revalidate templates later only if they do not turn the project into a stack catalog.
