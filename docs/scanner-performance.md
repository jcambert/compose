# Scanner performance and safety

`compose` discovers Docker Compose projects by recursively scanning a root directory for these file names:

```text
docker-compose.yml
docker-compose.yaml
compose.yml
compose.yaml
```

The scanner is designed to be safe for large developer workspaces. It avoids common generated or dependency-heavy directories by default and fails fast when traversal limits are reached.

## Default exclusions

The scanner skips directory names case-insensitively. Default exclusions include common dependency caches, build outputs and IDE folders, for example:

```text
.git
.vscode
.idea
.vs
node_modules
.pnpm-store
.yarn
.cache
.next
.nuxt
.turbo
dist
build
out
coverage
bin
obj
target
.terraform
.venv
venv
```

This keeps broad scans such as `compose scan C:\Sources` practical and prevents accidental traversal of dependency trees.

## Scan limits

The scanner has default guard rails:

```text
maxDirectoriesVisited = 50000
maxEntriesVisited     = 250000
```

When a limit is exceeded, the scanner aborts with a clear error instead of continuing indefinitely.

Use a narrower root or increase the limit only when needed:

```bash
compose scan C:\Sources --max-depth 8
compose scan C:\Sources --max-entries 500000
compose scan C:\Sources --max-directories 100000
```

## Additional exclusions

Use `--exclude` to skip extra generated folders that are specific to your machine or company workspace:

```bash
compose scan C:\Sources --exclude .local-cache tmp-generated
compose scan C:\Sources --exclude artifacts --max-depth 6
```

`--exclude` adds names on top of the built-in default exclusions; it does not replace them.

## JSON output

`compose scan --json` keeps JSON on stdout. Scanner warnings are written to stderr so scripts can continue parsing stdout safely.

```bash
compose scan C:\Sources --json --max-depth 5 > stacks.json
```

## Guidance

For daily usage, prefer a workspace root that is specific enough:

```bash
compose workspace add dev C:\Sources
compose workspace use dev
compose browse --filter api
```

For very large roots, start with:

```bash
compose scan C:\Sources --max-depth 4
```

Then increase depth only if expected stacks are missing.
