# GUI Streaming

`compose ui` uses Server-Sent Events for read-only live streams in the optional local browser interface.

The implementation remains local-only, token-protected and CLI-first. Streaming does not introduce a remote server mode, WebSocket dependency or a separate Docker Compose command model.

## Runtime stream

```text
GET /api/events/runtime?stackId=<stack-id>&intervalMs=5000
Authorization: Bearer <token>
```

Events:

```text
event: connected
event: runtime
event: runtime-error
```

The runtime stream periodically reuses the same runtime status reader used by the rest of the UI. The browser uses it to keep the selected stack status fresh without manual refresh.

## Log stream

```text
GET /api/logs/stream?stackId=<stack-id>&service=<service>&tail=200
Authorization: Bearer <token>
```

Events:

```text
event: connected
event: log
event: logs-error
event: logs-complete
```

The default implementation runs:

```bash
docker compose -f <compose-file> logs --follow --tail <tail> [service]
```

The child process is stopped when the browser closes the stream, the user stops streaming from the UI, or the local UI server shuts down.

## Browser UX

The local UI mounts a compact **Live streams** panel. It can:

- reload detected stacks
- select a stack
- select a service for logs
- start runtime streaming
- start live logs
- stop open streams

This panel is a read-only companion to the existing command workflow. Command execution remains behind preview and confirmation.

## Safety constraints

- The server still binds to `127.0.0.1`.
- The same short-lived token protects streaming endpoints.
- Streams are read-only.
- Command execution still requires preview and confirmation.
- Destructive command execution still requires stronger confirmation.
