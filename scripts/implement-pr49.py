from pathlib import Path

app_path = Path('src/ui/App.tsx')
app = app_path.read_text(encoding='utf-8')

app = app.replace(
    '  async function load() {',
    '  async function load(options: { resetSelection?: boolean } = {}) {',
    1,
)

old_selection = """      setState({ loading: false, health, doctor, workspaces, stacks });
      setSelectedId((current) => currentProjectOrFirst(current, stacks.stacks));
"""
new_selection = """      setState({ loading: false, health, doctor, workspaces, stacks });
      setSelectedId((current) => currentProjectOrFirst(options.resetSelection === true ? undefined : current, stacks.stacks));
      if (options.resetSelection === true) {
        setRuntime({ loading: false });
      }
"""
if old_selection not in app:
    raise SystemExit('load selection marker missing')
app = app.replace(old_selection, new_selection, 1)

old_use = """  async function useWorkspaceFromUi(name: string) {
    await runWorkspaceMutation(
      () => apiPost<WorkspaceListResult>(token, '/api/workspaces/current', { name }),
      `Workspace ${name} is now current.`,
      false,
    );
  }
"""
new_use = """  async function useWorkspaceFromUi(name: string) {
    await runWorkspaceMutation(
      () => apiPost<WorkspaceListResult>(token, '/api/workspaces/current', { name }),
      `Workspace ${name} is now current.`,
      false,
      true,
    );
  }
"""
if old_use not in app:
    raise SystemExit('use workspace marker missing')
app = app.replace(old_use, new_use, 1)

old_signature = """  async function runWorkspaceMutation(
    mutation: () => Promise<WorkspaceListResult>,
    successMessage: string,
    clearForm: boolean,
  ) {
"""
new_signature = """  async function runWorkspaceMutation(
    mutation: () => Promise<WorkspaceListResult>,
    successMessage: string,
    clearForm: boolean,
    resetWorkspaceContext = false,
  ) {
"""
if old_signature not in app:
    raise SystemExit('workspace mutation signature marker missing')
app = app.replace(old_signature, new_signature, 1)

old_tail = """      setWorkspaceRemovalName(undefined);
      setSelectedId(undefined);
      clearCommandFeedback(setForm);
      await load();
"""
new_tail = """      setWorkspaceRemovalName(undefined);
      clearCommandFeedback(setForm);
      await load({ resetSelection: resetWorkspaceContext });
      if (resetWorkspaceContext) {
        setActiveView('stacks');
      }
"""
if old_tail not in app:
    raise SystemExit('workspace mutation tail marker missing')
app = app.replace(old_tail, new_tail, 1)

app_path.write_text(app, encoding='utf-8')

changelog = Path('CHANGELOG.md')
text = changelog.read_text(encoding='utf-8')
addition = '- Fixed workspace activation so Use reloads stacks, resets the selected stack and runtime, and opens the refreshed stack view.\n'
if addition not in text:
    text = text.replace('## Unreleased\n', '## Unreleased\n\n' + addition, 1)
changelog.write_text(text, encoding='utf-8')

Path('scripts/implement-pr49.py').unlink(missing_ok=True)
