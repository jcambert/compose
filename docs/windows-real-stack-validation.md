# Windows and real-stack validation

This validation closes the hardening gap after guided Compose service editing was exposed in the local UI.

## Automated coverage

- The normal CI validates Node.js 20 and 22 on Linux.
- `Windows integration` validates the full project on `windows-latest` with Node.js 22.
- The installed-package smoke test builds an npm tarball, installs it into an isolated prefix and invokes the installed `compose` binary.
- The smoke workspace deliberately contains spaces in its Windows-compatible path.
- Realistic Compose fixtures cover anchors, extension fields, health checks, labels, networks, deploy settings, secrets, configs and named volumes.
- Editing tests cover LF and CRLF source files, create/update/delete workflows and stale-preview rejection.

## Manual Docker acceptance scenario

From a Windows machine with Docker Desktop running:

```powershell
npm install -g @jc90100/compose@latest
compose --version
compose scan C:\Sources --json
compose ui
```

In the browser:

1. Select a stack.
2. Open **Services**.
3. Change the image, ports, environment or volumes of one service.
4. Review the generated YAML diff.
5. Confirm the write.
6. Run `docker compose -f <compose-file> config`.
7. Start the stack with `docker compose -f <compose-file> up -d`.

The editor must preserve advanced keys it does not own and reject the save when the file changed after the preview was generated.
