# Architecture

## Intent

`compose` is a focused Node.js CLI that helps developers discover, inspect, execute and maintain Docker Compose projects from a terminal.

The architecture keeps a traditional separation between user interaction, application use cases, domain logic, YAML handling, workspace persistence and process execution. This makes the code easy to test and ready for future extensions such as workspaces, favourites, generated documentation, remote execution experiments, and an optional graphical interface.

A key product principle is that `compose` must guide the user when a command has meaningful options. For example, `compose up` can ask whether the user wants detached mode, whether images should be built, and whether orphan containers should be removed. This guidance is optional and never removes scriptability.

A second product principle is that users can browse discovered stacks interactively. The browser is a terminal workflow over the same scan and execution primitives: it lists stacks, lets the user drill into services, and generates normal typed Compose execution requests.

A third product principle is daily usability. Named workspaces, favorites and recent stacks are stored locally so the user can run `compose browse` without retyping the same root directory every day.

A fourth product principle is CLI-first GUI readiness. A future GUI must be launched by the CLI, reuse the same application services, and remain optional.

## High-level modules

```text
src/
  app/          reusable application services shared by CLI and future GUI adapters
  cli/          terminal adapter, command registration and terminal output
  compose/      Docker Compose command model, builder and executor
  doctor/       diagnostics model and runner
  guided/       UI-neutral command descriptors and guided option resolution
  interactive/  interactive stack and service browsing workflow
  project/      creates projects and mutates service definitions
  scanner/      recursively discovers Compose files
  workspace/    stores local workspaces, favorites and recent stacks
  yaml/         parses, validates and writes Compose YAML documents
  utils/        common filesystem, path, logging and error helpers
```

The `app` module is the boundary that CLI commands and the future GUI should call. It contains application use cases such as scanning projects, resolving Compose commands, previewing and executing commands, managing workspaces and favorites, delegating to doctor diagnostics and launching browser workflows.

The `cli` module remains intentionally thin. It parses Commander options, delegates to `app` services, renders terminal output, and injects terminal-specific prompt adapters when guidance is needed.

The `guided` module is intentionally separated from terminal rendering. It describes command questions and resolves typed options, but it does not import Inquirer and does not execute Docker. The terminal adapter lives under `cli`, and a future GUI can provide another adapter over the same descriptors.

The `interactive` module owns the stack/service browsing workflow. It scans for stacks, builds menus from discovered projects and services, displays runtime status and resolves menu selections into typed `ComposeExecutionRequest` values. The application layer wires this workflow to workspace favorites and recent stacks so future frontends can reuse it without duplicating CLI rules.

The `workspace` module owns local configuration. It resolves the user config path, loads/saves JSON, normalizes older or partial config files, manages named roots, stores workspace-scoped favorite stacks and records recent stack selections. It does not import terminal prompts.

## Dependency direction

```text
cli
 └─ app
     ├─ compose
     ├─ doctor
     ├─ guided
     ├─ interactive
     ├─ project
     ├─ scanner
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

The future GUI must reuse the same application services, command descriptors, browser workflows, workspace store and command intent models as the CLI. The GUI must not parse terminal help output or duplicate command-generation logic.

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
  -> app.scanComposeProjects(...)
  -> scanner.scanComposeFiles(root)
  -> yaml.parseComposeDocument(file)
  -> DiscoveredComposeProject[]
  -> terminal output or JSON
```

### Workspace-backed browsing

```text
User command
  -> cli browse command without root
  -> app.browseApplicationStacks(...)
  -> workspace.load config
  -> resolve current workspace root
  -> interactive.browseComposeStacks(root, favorites)
  -> scanner.scanComposeFiles(root)
  -> runtime status reader
  -> prompt adapter selects stack or service action
  -> typed ComposeExecutionRequest
  -> compose.buildComposeCommand(request)
  -> compose.executeComposeCommand(request)
  -> workspace favorite/recent updates through app service
  -> return to browser menu
```

### Interactive stack browsing with explicit root

```text
User command
  -> cli browse command with root
  -> app.browseApplicationStacks(root)
  -> interactive.browseComposeStacks(root)
  -> scanner.scanComposeFiles(root)
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
  -> app.resolveComposeApplicationCommand(...)
  -> guided.getGuidedCommandDescriptor(command)
  -> prompt adapter asks missing or recommended questions
  -> guided.resolveGuidedCommand(...)
  -> typed ComposeExecutionRequest
  -> app.executeComposeApplicationCommand(...)
  -> compose.buildComposeCommand(request)
  -> compose.executeComposeCommand(request)
  -> docker compose process
```

### Non-interactive Compose execution

```text
Script or CI command
  -> cli command options
  -> app.resolveComposeApplicationCommand(...)
  -> typed ComposeExecutionRequest
  -> app.executeComposeApplicationCommand(...)
  -> compose.buildComposeCommand(request)
  -> compose.executeComposeCommand(request)
  -> docker compose process
```

### Project mutation

```text
User command
  -> cli project command options
  -> app project service
  -> resolve Compose file path
  -> parse existing compose.yaml
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
  -> app service
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
- Application services must not import Commander or Inquirer.
- The GUI must be launched from the CLI and remain optional.
- The GUI must not create a separate command model or configuration format.
- Destructive actions must remain explicit in both terminal and GUI workflows.

## Application service contracts

The current reusable boundary is intentionally small and incremental:

```text
src/app/scan-service.ts              scan Compose projects
src/app/compose-file-resolver.ts     resolve project/file targets
src/app/compose-command-service.ts   resolve, preview and execute Compose commands
src/app/project-service.ts           create/update/validate Compose projects
src/app/workspace-service.ts         manage workspaces and favorites
src/app/stack-browser-service.ts     wire browsing to workspace persistence
src/app/doctor-service.ts            expose diagnostics through the app boundary
```

These services are designed for both terminal and future local HTTP adapters.

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

- Add stable JSON contracts for the upcoming local UI server.
- Add command descriptors for every Docker Compose command.
- Add guided prompt plans for project management commands.
- Add GUI components that render forms from guided descriptors, workspace config and stack browser workflows.
- Add workspace import/export.
- Add richer Compose schema validation.
- Add Docker availability checks.
- Add TUI mode for long-running logs and project dashboards.
- Revalidate templates later only if they do not turn the project into a stack catalog.
