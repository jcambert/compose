# Browser Filtering and Sorting

`compose browse` and its `compose stacks` alias can start the stack selection with a narrowed and ordered list.

The feature is intentionally implemented in the CLI prompt adapter. It does not change Docker Compose command generation, execution, workspaces or the future GUI API contracts.

## Commands

```bash
compose browse C:\Sources --filter api
compose browse C:\Sources --sort runtime
compose browse C:\Sources --filter monitoring --sort path
compose stacks . --filter worker --sort services --dry-run
```

## Filter

`--filter <text>` filters the initial stack selection list before the first prompt is displayed.

The filter matches the rendered stack choice, which includes:

- stack name
- relative Compose file path
- runtime summary text
- service count text
- favorite/runtime icon text rendered in the browser choice

Examples:

```bash
compose browse --filter api
compose browse --filter compose.yaml
compose browse --filter running
compose browse --filter workers
```

Control entries such as Refresh and Quit remain available even when no stack matches the filter.

## Sort modes

`--sort <mode>` accepts:

```text
name
path
services
runtime
```

Behaviour:

- `name`: alphabetical stack selection.
- `path`: relative Compose file path order.
- `services`: stacks with the most detected services first.
- `runtime`: running stacks first, then partial, stopped, unavailable and unknown.

Favorites remain first regardless of the selected sort mode.

## Safety

Filtering and sorting are presentation-only features. They do not modify local configuration and they do not affect the generated Docker Compose command.

Danger-zone actions still require the existing confirmation prompts.
