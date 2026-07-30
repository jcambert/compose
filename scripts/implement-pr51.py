from pathlib import Path

service_path = Path('src/app/ui-server-service.ts')
service = service_path.read_text(encoding='utf-8')

old_start = """  const token = options.token ?? randomBytes(24).toString('hex');
  const runtimeDependencies = createRuntimeDependencies(dependencies);
  const context: RequestContext = {
"""
new_start = """  const token = options.token ?? randomBytes(24).toString('hex');
  const runtimeDependencies = createRuntimeDependencies(dependencies);
  await activateRequestedWorkspace(options.workspaceName, runtimeDependencies);
  const context: RequestContext = {
"""
if old_start not in service:
    raise SystemExit('startLocalUiServer marker not found')
service = service.replace(old_start, new_start, 1)

old_resolver = """  const workspaceName = readOptionalStringQuery(url, 'workspace') ?? context.options.workspaceName;
  const workspaceResult = await context.dependencies.listWorkspaces();
"""
new_resolver = """  const workspaceName = readOptionalStringQuery(url, 'workspace');
  const workspaceResult = await context.dependencies.listWorkspaces();
"""
if old_resolver not in service:
    raise SystemExit('workspace resolver marker not found')
service = service.replace(old_resolver, new_resolver, 1)

marker = """async function resolveStackScanContext(url: URL, context: RequestContext): Promise<StackScanContext> {
"""
helper = """async function activateRequestedWorkspace(
  workspaceName: string | undefined,
  dependencies: RuntimeDependencies,
): Promise<void> {
  if (workspaceName === undefined) {
    return;
  }

  const workspaces = await dependencies.listWorkspaces();
  const workspaceExists = workspaces.workspaces.some((workspace) => workspace.name === workspaceName);

  if (!workspaceExists) {
    throw new Error(`Workspace not found: ${workspaceName}`);
  }

  await dependencies.setWorkspace({ name: workspaceName });
}

"""
if marker not in service:
    raise SystemExit('resolveStackScanContext marker not found')
service = service.replace(marker, helper + marker, 1)
service_path.write_text(service, encoding='utf-8')

test_path = Path('tests/unit/ui-server-service.test.ts')
test = test_path.read_text(encoding='utf-8')
anchor = """  it('manages workspaces through token-protected local API endpoints', async () => {
"""
if anchor not in test:
    raise SystemExit('test insertion anchor not found')
new_tests = """  it('activates an explicitly requested CLI workspace before serving stacks', async () => {
    let currentWorkspaceName = 'ia';
    const scannedRoots: string[] = [];
    const workspaces: WorkspaceDefinition[] = [
      {
        name: 'dev',
        path: '/workspace/dev',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        name: 'ia',
        path: '/workspace/ia',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const server = await startTestServer({
      listWorkspaces: async () => ({ workspaces, currentWorkspaceName }),
      setWorkspace: async ({ name }) => {
        currentWorkspaceName = name;
      },
      scanProjects: async ({ root }) => {
        scannedRoots.push(root ?? '.');
        return [project];
      },
    }, { workspaceName: 'dev' });

    try {
      const workspacesResult = await getJson(server, '/api/workspaces');
      const stacks = await getJson(server, '/api/stacks');

      expect(workspacesResult).toMatchObject({ currentWorkspaceName: 'dev' });
      expect(stacks).toMatchObject({ root: '/workspace/dev', workspaceName: 'dev' });
      expect(scannedRoots).toEqual(['/workspace/dev']);
    } finally {
      await server.close();
    }
  });

  it('uses the last active workspace when no CLI workspace is provided', async () => {
    const scannedRoots: string[] = [];
    const server = await startTestServer({
      listWorkspaces: async () => ({
        currentWorkspaceName: 'ia',
        workspaces: [
          {
            name: 'ia',
            path: '/workspace/ia',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
      scanProjects: async ({ root }) => {
        scannedRoots.push(root ?? '.');
        return [project];
      },
    });

    try {
      const stacks = await getJson(server, '/api/stacks');

      expect(stacks).toMatchObject({ root: '/workspace/ia', workspaceName: 'ia' });
      expect(scannedRoots).toEqual(['/workspace/ia']);
    } finally {
      await server.close();
    }
  });

"""
test = test.replace(anchor, new_tests + anchor, 1)
test_path.write_text(test, encoding='utf-8')

changelog_path = Path('CHANGELOG.md')
changelog = changelog_path.read_text(encoding='utf-8')
entry = "- Honor `compose ui --workspace <name>` by activating that workspace before the local UI server starts; without the option, the last active workspace remains in use.\n"
if entry not in changelog:
    unreleased = '## [Unreleased]\n'
    if unreleased in changelog:
        changelog = changelog.replace(unreleased, unreleased + '\n' + entry, 1)
    else:
        changelog = entry + '\n' + changelog
    changelog_path.write_text(changelog, encoding='utf-8')
