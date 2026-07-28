# Configuration Management

`compose` stores local workspaces, favorites and recent stacks in a user configuration file.

The config file is local to the developer machine and is not related to Docker Compose YAML project files.

## Commands

```bash
compose config path
compose config path --json
compose config export
compose config export --output compose-config.backup.json
compose config import compose-config.backup.json
compose config import compose-config.backup.json --yes
compose config reset
compose config reset --yes
```

`compose config` without a subcommand still delegates to `docker compose config` for the selected Compose project.

## Config path

```bash
compose config path
```

Prints the resolved local config path.

Default locations:

```text
Windows:     %APPDATA%\compose\config.json
Linux/macOS: ~/.config/compose/config.json
```

`COMPOSE_CONFIG_PATH` can override the default location.

## Export

```bash
compose config export
```

Prints the current normalized config as JSON.

Use `--output` to write the backup to a file:

```bash
compose config export --output compose-config.backup.json
```

The exported JSON includes:

- workspaces
- current workspace name
- favorite stacks
- recent stacks

## Import

```bash
compose config import compose-config.backup.json
```

Imports a JSON backup and replaces the current local config after confirmation.

Use `--yes` for scripted restore flows:

```bash
compose config import compose-config.backup.json --yes
```

Before saving, the import validates:

- root shape
- config version
- workspace definitions
- current workspace reference
- favorite stack entries
- recent stack entries
- workspace references from favorites and recents

Invalid config files are rejected before the current config is overwritten.

## Reset

```bash
compose config reset
```

Resets the local config to an empty configuration after confirmation.

Use `--yes` for scripted reset flows:

```bash
compose config reset --yes
```

The reset keeps the config file path but removes all workspaces, favorites and recents.

## Docker Compose config compatibility

The existing Docker Compose config passthrough remains available:

```bash
compose config --project ./infra --services
compose config --project ./infra --quiet
compose config --project ./infra --format json
```

The difference is:

```text
compose config path/export/import/reset  -> compose CLI user config
compose config --project ./infra         -> docker compose config passthrough
```
