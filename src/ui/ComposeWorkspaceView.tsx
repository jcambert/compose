import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  apiGet,
  apiPost,
  type DeleteStackDocumentResult,
  type DiscoveredComposeProject,
  type StackDocument,
  type StackDocumentPreview,
  type StackRuntimeStatus,
  type ComposeExecutionResult,
} from './api';
import {
  canDeleteStack,
  createStackCommandRequest,
  executionFailureMessage,
  formatExecutionOutput,
  isStackActive,
} from './compose-workspace-model';

const ComposeCodeEditor = lazy(async () => {
  const module = await import('./ComposeCodeEditor');
  return { default: module.ComposeCodeEditor };
});

type Props = {
  token: string;
  project?: DiscoveredComposeProject;
  runtime?: StackRuntimeStatus;
  workspaceRoot?: string;
  onChooseStack: () => void;
  onOpenGuidedEditor: () => void;
  onRuntimeRefresh: () => Promise<void> | void;
  onProjectChanged: (composeFilePath?: string) => Promise<void> | void;
  onDirtyChange: (dirty: boolean) => void;
};

type EditorMode = 'view' | 'edit' | 'create';
type LifecycleCommand = 'start' | 'stop' | 'restart' | 'down' | 'pull' | 'up';

const defaultYaml = [
  'services:',
  '  nginx:',
  '    image: nginx:latest',
  '    restart: unless-stopped',
  '    ports:',
  '      - "8080:80"',
  '',
].join('\n');

export function ComposeWorkspaceView({
  token,
  project,
  runtime,
  workspaceRoot,
  onChooseStack,
  onOpenGuidedEditor,
  onRuntimeRefresh,
  onProjectChanged,
  onDirtyChange,
}: Props) {
  const [mode, setMode] = useState<EditorMode>('view');
  const [stackDocument, setStackDocument] = useState<StackDocument>();
  const [stackName, setStackName] = useState('');
  const [yaml, setYaml] = useState('');
  const [env, setEnv] = useState('');
  const [preview, setPreview] = useState<StackDocumentPreview>();
  const [reviewed, setReviewed] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [operationOutput, setOperationOutput] = useState('');

  const active = isStackActive(runtime);
  const dirty = useMemo(() => {
    if (mode === 'create') {
      return stackName.length > 0 || yaml !== defaultYaml || env.length > 0;
    }
    return mode === 'edit'
      && stackDocument !== undefined
      && (yaml !== stackDocument.yaml || env !== stackDocument.env);
  }, [env, mode, stackDocument, stackName, yaml]);

  useEffect(() => {
    onDirtyChange(dirty);
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      onDirtyChange(false);
    };
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (mode === 'create') return;
    setMode('view');
    setPreview(undefined);
    setDeleteConfirmation('');
    void loadDocument();
  }, [project?.id, token]);

  async function loadDocument() {
    if (project === undefined) {
      setStackDocument(undefined);
      setYaml('');
      setEnv('');
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      const result = await apiGet<StackDocument>(
        token,
        '/api/stacks/' + encodeURIComponent(project.id) + '/compose',
      );
      setStackDocument(result);
      setStackName(result.stackName);
      setYaml(result.yaml);
      setEnv(result.env);
      setPreview(undefined);
      setReviewed(false);
    } catch (loadError) {
      setError(messageFor(loadError, 'Unable to load the Compose document.'));
    } finally {
      setBusy(false);
    }
  }

  function beginEdit() {
    if (stackDocument === undefined) return;
    setYaml(stackDocument.yaml);
    setEnv(stackDocument.env);
    setPreview(undefined);
    setReviewed(false);
    setError(undefined);
    setMessage(undefined);
    setMode('edit');
  }

  function beginCreate() {
    if (!confirmDiscard()) return;
    setMode('create');
    setStackDocument(undefined);
    setStackName('');
    setYaml(defaultYaml);
    setEnv('');
    setPreview(undefined);
    setReviewed(false);
    setDeleteConfirmation('');
    setError(undefined);
    setMessage(undefined);
    setOperationOutput('');
  }

  function discard() {
    if (!confirmDiscard()) return;
    if (mode === 'create') {
      setMode('view');
      void loadDocument();
      return;
    }
    if (stackDocument !== undefined) {
      setYaml(stackDocument.yaml);
      setEnv(stackDocument.env);
    }
    setMode('view');
    setPreview(undefined);
    setReviewed(false);
    setError(undefined);
  }

  function confirmDiscard(): boolean {
    return !dirty || window.confirm('Discard the unsaved Compose document changes?');
  }

  async function previewChanges() {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    setPreview(undefined);
    setReviewed(false);

    try {
      const path = mode === 'create'
        ? '/api/stacks/preview'
        : '/api/stacks/' + encodeURIComponent(project?.id ?? '') + '/compose/preview';
      const payload = mode === 'create' ? { stackName, yaml, env } : { yaml, env };
      setPreview(await apiPost<StackDocumentPreview>(token, path, payload));
    } catch (previewError) {
      setError(messageFor(previewError, 'Unable to preview stack changes.'));
    } finally {
      setBusy(false);
    }
  }

  async function commitPreview(deploy: boolean) {
    if (preview === undefined) return;
    if (!reviewed) {
      setError('Review and confirm the complete YAML/.env diff before saving.');
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      const path = preview.operation === 'create'
        ? '/api/stacks/commit'
        : '/api/stacks/' + encodeURIComponent(project?.id ?? '') + '/compose/commit';
      const committed = await apiPost<StackDocument>(token, path, { preview });
      setStackDocument(committed);
      setStackName(committed.stackName);
      setYaml(committed.yaml);
      setEnv(committed.env);
      setPreview(undefined);
      setReviewed(false);
      setMode('view');
      if (deploy) {
        const result = await executeAt(committed.composeFilePath, 'up', [], {
          detach: true,
          removeOrphans: true,
        });
        setOperationOutput(formatExecutionOutput(result));
        const failure = executionFailureMessage(result);
        if (failure === undefined) {
          setMessage('Stack document saved and deployed.');
        } else {
          setMessage('Stack document saved, but deployment failed.');
          setError(failure);
        }
      } else {
        setMessage('Stack draft saved.');
      }

      await onProjectChanged(committed.composeFilePath);
      await onRuntimeRefresh();
    } catch (commitError) {
      setError(messageFor(commitError, 'Unable to save the stack document.'));
    } finally {
      setBusy(false);
    }
  }

  async function runLifecycle(command: LifecycleCommand, serviceName?: string) {
    if (stackDocument === undefined || busy) return;
    if (command === 'down' && !window.confirm('Run docker compose down for ' + stackDocument.stackName + '?')) {
      return;
    }

    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    const results: ComposeExecutionResult[] = [];

    try {
      if (command === 'pull') {
        const pull = await executeAt(stackDocument.composeFilePath, 'pull');
        results.push(pull);
        requireSuccessfulExecution(pull);
        if (active) {
          const recreate = await executeAt(stackDocument.composeFilePath, 'up', [], {
            detach: true,
            removeOrphans: true,
          });
          results.push(recreate);
          requireSuccessfulExecution(recreate);
        }
      } else {
        const services = serviceName === undefined ? [] : [serviceName];
        const options = command === 'up' ? { detach: true, removeOrphans: true } : {};
        const result = await executeAt(stackDocument.composeFilePath, command, services, options);
        results.push(result);
        requireSuccessfulExecution(result);
      }

      setOperationOutput(results.map(formatExecutionOutput).join('\n\n'));
      setMessage(command === 'pull' ? 'Stack update completed.' : command + ' completed.');
      await onRuntimeRefresh();
    } catch (commandError) {
      setError(messageFor(commandError, 'Unable to execute the stack action.'));
      setOperationOutput(results.map(formatExecutionOutput).join('\n\n'));
    } finally {
      setBusy(false);
    }
  }

  async function executeAt(
    composeFilePath: string,
    command: LifecycleCommand,
    services: string[] = [],
    options: Record<string, unknown> = {},
  ): Promise<ComposeExecutionResult> {
    const result = await apiPost<ComposeExecutionResult>(
      token,
      '/api/commands/execute',
      createStackCommandRequest(composeFilePath, command, services, options),
    );

    return result;
  }

  async function deleteStack() {
    if (
      stackDocument === undefined
      || !canDeleteStack(stackDocument.stackName, deleteConfirmation)
      || busy
    ) return;

    if (!window.confirm('Take down and permanently remove the managed stack ' + stackDocument.stackName + '?')) {
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      const down = await executeAt(stackDocument.composeFilePath, 'down', [], { removeOrphans: true });
      setOperationOutput(formatExecutionOutput(down));
      requireSuccessfulExecution(down);
      const result = await apiPost<DeleteStackDocumentResult>(
        token,
        '/api/stacks/' + encodeURIComponent(project?.id ?? '') + '/compose/delete',
        {
          expectedContentHash: stackDocument.contentHash,
          expectedEnvContentHash: stackDocument.envContentHash,
          confirmedStackName: deleteConfirmation,
        },
      );
      setMessage('Removed ' + result.stackName + ' and ' + result.removedFiles.length + ' managed file(s).');
      setDeleteConfirmation('');
      setStackDocument(undefined);
      await onProjectChanged();
    } catch (deleteError) {
      setError(messageFor(deleteError, 'Unable to delete the stack.'));
    } finally {
      setBusy(false);
    }
  }

  if (project === undefined && mode !== 'create') {
    return (
      <div className="view-stack">
        <section className="panel empty-action">
          <div className="empty-state">
            <strong>Select a stack or create a new one</strong>
            <span>The Compose workspace always targets the active local workspace.</span>
          </div>
          <div className="actions">
            <button type="button" onClick={onChooseStack}>Choose a stack</button>
            <button className="secondary" type="button" onClick={beginCreate} disabled={workspaceRoot === undefined}>New stack</button>
          </div>
        </section>
      </div>
    );
  }

  const shownName = mode === 'create' ? (stackName || 'New stack') : stackDocument?.stackName ?? project?.name ?? 'Stack';

  return (
    <div className="view-stack compose-workspace-view" data-selected-stack-name={shownName}>
      <section className="hero-panel compact-hero compose-workspace-hero">
        <div>
          <p className="eyebrow">Compose workspace · Dockge-style local workflow</p>
          <h2>{shownName}</h2>
          <p className="muted">{mode === 'create' ? 'Create beneath ' + (workspaceRoot ?? 'the active workspace') : stackDocument?.composeFilePath}</p>
        </div>
        <div className="hero-actions compose-lifecycle-actions">
          {mode === 'view' ? (
            <>
              <button type="button" onClick={beginEdit} disabled={busy || stackDocument === undefined}>Edit stack</button>
              {!active ? <button type="button" onClick={() => void runLifecycle('up')} disabled={busy}>Start</button> : null}
              {active ? <button className="secondary" type="button" onClick={() => void runLifecycle('restart')} disabled={busy}>Restart</button> : null}
              <button className="secondary" type="button" onClick={() => void runLifecycle('pull')} disabled={busy}>Update</button>
              {active ? <button className="secondary" type="button" onClick={() => void runLifecycle('stop')} disabled={busy}>Stop</button> : null}
              <button className="ghost" type="button" onClick={() => void runLifecycle('down')} disabled={busy}>Down</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => void commitPreview(true)} disabled={busy || preview === undefined || !reviewed}>Deploy stack</button>
              <button className="secondary" type="button" onClick={() => void commitPreview(false)} disabled={busy || preview === undefined || !reviewed}>Save draft</button>
              <button className="ghost" type="button" onClick={discard} disabled={busy}>Discard</button>
            </>
          )}
          <button className="ghost" type="button" onClick={beginCreate} disabled={busy || workspaceRoot === undefined}>New stack</button>
        </div>
      </section>

      {error === undefined ? null : <div className="banner danger">{error}</div>}
      {message === undefined ? null : <div className="banner info">{message}</div>}

      <section className="compose-workspace-grid">
        <div className="compose-stack-column">
          {mode === 'create' ? (
            <article className="panel">
              <div className="panel-heading"><div><h3>General</h3><p>Workspace-scoped stack identity.</p></div></div>
              <label>Stack name
                <input
                  value={stackName}
                  placeholder="my-stack"
                  pattern="[a-z0-9][a-z0-9_-]*"
                  onChange={(event) => {
                    setStackName(event.target.value.toLowerCase());
                    setPreview(undefined);
                  }}
                />
              </label>
              <small className="muted">Lowercase letters, numbers, underscores and hyphens only.</small>
            </article>
          ) : (
            <StackSummary
              stackDocument={stackDocument}
              runtime={runtime}
              busy={busy}
              onServiceAction={(command, serviceName) => void runLifecycle(command, serviceName)}
              onOpenGuidedEditor={onOpenGuidedEditor}
            />
          )}

          <article className="panel">
            <div className="panel-heading">
              <div><h3>.env</h3><p>Compose interpolation variables.</p></div>
            </div>
            <Suspense fallback={<div className="loading-skeleton">Loading editor...</div>}>
              <ComposeCodeEditor
                className="env-code-editor"
                value={env}
                height="240px"
                language="env"
                editable={mode !== 'view'}
                onChange={(value) => {
                  setEnv(value);
                  setPreview(undefined);
                  setReviewed(false);
                }}
              />
            </Suspense>
          </article>
        </div>

        <div className="compose-document-column">
          <article className="panel compose-editor-panel">
            <div className="panel-heading">
              <div><h3>{stackDocument?.composeFilePath.split(/[\\/]/).pop() ?? 'compose.yaml'}</h3><p>Advanced editor preserving comments and unsupported keys.</p></div>
              <span className={'status-pill ' + (dirty ? 'warning' : 'ok')}>{dirty ? 'Unsaved' : 'Saved'}</span>
            </div>
            <Suspense fallback={<div className="loading-skeleton">Loading editor...</div>}>
              <ComposeCodeEditor
                value={yaml}
                height="560px"
                language="yaml"
                editable={mode !== 'view'}
                onChange={(value) => {
                  setYaml(value);
                  setPreview(undefined);
                  setReviewed(false);
                }}
              />
            </Suspense>
            {mode === 'view' ? null : (
              <div className="actions editor-actions">
                <button type="button" onClick={() => void previewChanges()} disabled={busy || yaml.trim().length === 0 || (mode === 'create' && stackName.length === 0)}>
                  {busy ? 'Validating...' : 'Validate and preview'}
                </button>
              </div>
            )}
          </article>
        </div>
      </section>

      {preview === undefined ? null : (
        <section className="panel stack-document-preview">
          <div className="panel-heading"><div><h3>Complete file diff</h3><p>Both files were validated. Review the exact text before writing.</p></div></div>
          <pre className="yaml-diff" aria-label="Stack document diff">{preview.diff || 'No textual change.'}</pre>
          <label className="confirm-row">
            <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
            I reviewed the complete Compose and .env diff.
          </label>
        </section>
      )}

      {operationOutput.length === 0 ? null : (
        <section className="panel operation-console">
          <div className="panel-heading"><div><h3>Operation output</h3><p>Docker Compose command and diagnostics.</p></div></div>
          <pre>{operationOutput}</pre>
        </section>
      )}

      {mode !== 'view' || stackDocument === undefined ? null : (
        <section className="panel danger-zone stack-delete-zone">
          <div>
            <strong>Delete managed stack</strong>
            <p>Compose first runs down. Deletion is refused if the directory contains any file other than the Compose document and .env.</p>
          </div>
          <label>Type {stackDocument.stackName} to confirm
            <input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} />
          </label>
          <button className="danger" type="button" disabled={busy || !canDeleteStack(stackDocument.stackName, deleteConfirmation)} onClick={() => void deleteStack()}>
            Delete stack
          </button>
        </section>
      )}
    </div>
  );
}

function requireSuccessfulExecution(result: ComposeExecutionResult): void {
  const failure = executionFailureMessage(result);
  if (failure !== undefined) {
    throw new Error(failure);
  }
}

function StackSummary({
  stackDocument,
  runtime,
  busy,
  onServiceAction,
  onOpenGuidedEditor,
}: {
  stackDocument?: StackDocument;
  runtime?: StackRuntimeStatus;
  busy: boolean;
  onServiceAction: (command: 'start' | 'stop' | 'restart', serviceName: string) => void;
  onOpenGuidedEditor: () => void;
}) {
  if (stackDocument === undefined) {
    return <article className="panel"><div className="loading-skeleton">Loading stack document...</div></article>;
  }

  return (
    <>
      {stackDocument.urls.length === 0 ? null : (
        <div className="compose-url-list">
          {stackDocument.urls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{displayUrl(url)}</a>)}
        </div>
      )}
      <article className="panel">
        <div className="panel-heading">
          <div><h3>Services</h3><p>{runtime?.summary ?? stackDocument.services.length + ' declared'}</p></div>
          <button className="secondary" type="button" onClick={onOpenGuidedEditor}>Guided editor</button>
        </div>
        <div className="compose-service-list">
          {stackDocument.services.map((serviceName) => {
            const status = runtime?.services?.[serviceName];
            const running = ['running', 'healthy', 'unhealthy', 'restarting'].includes(status?.state.toLowerCase() ?? '');
            return (
              <div className="compose-service-row" key={serviceName}>
                <div>
                  <strong>{serviceName}</strong>
                  <span className={'status-pill ' + (running ? 'ok' : 'warning')}>{status?.state ?? 'not created'}</span>
                  {(status?.ports ?? []).map((port) => <small key={port}>{port}</small>)}
                </div>
                <div className="actions">
                  {!running ? <button type="button" onClick={() => onServiceAction('start', serviceName)} disabled={busy}>Start</button> : null}
                  {running ? <button className="secondary" type="button" onClick={() => onServiceAction('restart', serviceName)} disabled={busy}>Restart</button> : null}
                  {running ? <button className="ghost" type="button" onClick={() => onServiceAction('stop', serviceName)} disabled={busy}>Stop</button> : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="network-summary">
          <small>Networks</small>
          <div>{stackDocument.networks.length === 0 ? <span className="muted">Default network</span> : stackDocument.networks.map((network) => (
            <span className="status-pill warning" key={network.name}>{network.name}{network.external ? ' · external' : ''}</span>
          ))}</div>
        </div>
      </article>
    </>
  );
}

function displayUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.host + (url.pathname === '/' ? '' : url.pathname) + url.search;
  } catch {
    return value;
  }
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
