from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text(encoding='utf-8')
    if old not in content:
        raise RuntimeError(f'Expected snippet not found in {path}: {old[:80]!r}')
    file.write_text(content.replace(old, new, 1), encoding='utf-8')


def append(path: str, content: str) -> None:
    file = Path(path)
    current = file.read_text(encoding='utf-8')
    if content.strip() not in current:
        file.write_text(current.rstrip() + '\n\n' + content.strip() + '\n', encoding='utf-8')


# Export the editing service from the application boundary.
replace(
    'src/app/index.ts',
    "export * from './compose-file-resolver.js';\n",
    "export * from './compose-file-resolver.js';\nexport * from './compose-editing-service.js';\n",
)

# Local UI server: wire editing service dependencies and routes.
replace(
    'src/app/ui-server-service.ts',
    "import { executeComposeApplicationCommand, previewComposeApplicationCommand } from './compose-command-service.js';\n",
    "import { executeComposeApplicationCommand, previewComposeApplicationCommand } from './compose-command-service.js';\nimport {\n  commitComposeServiceMutation,\n  listComposeServices,\n  previewCreateComposeService,\n  previewDeleteComposeService,\n  previewUpdateComposeService,\n  type CommitComposeServiceMutationInput,\n  type ComposeServiceListResult,\n  type ComposeServiceMutationCommitResult,\n  type PreviewCreateComposeServiceInput,\n  type PreviewDeleteComposeServiceInput,\n  type PreviewUpdateComposeServiceInput,\n} from './compose-editing-service.js';\nimport type { ComposeServiceMutationPreview } from '../yaml/compose-service-editor.js';\n",
)
replace(
    'src/app/ui-server-service.ts',
    "  executeCommand?: (input: ComposeApplicationCommandInput) => Promise<ComposeApplicationCommandResult>;\n};",
    "  executeCommand?: (input: ComposeApplicationCommandInput) => Promise<ComposeApplicationCommandResult>;\n  listComposeServices?: (input: { composeFilePath: string }) => Promise<ComposeServiceListResult>;\n  previewCreateComposeService?: (input: PreviewCreateComposeServiceInput) => Promise<ComposeServiceMutationPreview>;\n  previewUpdateComposeService?: (input: PreviewUpdateComposeServiceInput) => Promise<ComposeServiceMutationPreview>;\n  previewDeleteComposeService?: (input: PreviewDeleteComposeServiceInput) => Promise<ComposeServiceMutationPreview>;\n  commitComposeServiceMutation?: (input: CommitComposeServiceMutationInput) => Promise<ComposeServiceMutationCommitResult>;\n};",
)
replace(
    'src/app/ui-server-service.ts',
    "  executeCommand: (input: ComposeApplicationCommandInput) => Promise<ComposeApplicationCommandResult>;\n};",
    "  executeCommand: (input: ComposeApplicationCommandInput) => Promise<ComposeApplicationCommandResult>;\n  listComposeServices: (input: { composeFilePath: string }) => Promise<ComposeServiceListResult>;\n  previewCreateComposeService: (input: PreviewCreateComposeServiceInput) => Promise<ComposeServiceMutationPreview>;\n  previewUpdateComposeService: (input: PreviewUpdateComposeServiceInput) => Promise<ComposeServiceMutationPreview>;\n  previewDeleteComposeService: (input: PreviewDeleteComposeServiceInput) => Promise<ComposeServiceMutationPreview>;\n  commitComposeServiceMutation: (input: CommitComposeServiceMutationInput) => Promise<ComposeServiceMutationCommitResult>;\n};",
)
replace(
    'src/app/ui-server-service.ts',
    "    executeCommand: dependencies.executeCommand ?? ((input) => executeComposeApplicationCommand(input, { processRunner: captureProcessRunner })),\n  };",
    "    executeCommand: dependencies.executeCommand ?? ((input) => executeComposeApplicationCommand(input, { processRunner: captureProcessRunner })),\n    listComposeServices: dependencies.listComposeServices ?? listComposeServices,\n    previewCreateComposeService: dependencies.previewCreateComposeService ?? previewCreateComposeService,\n    previewUpdateComposeService: dependencies.previewUpdateComposeService ?? previewUpdateComposeService,\n    previewDeleteComposeService: dependencies.previewDeleteComposeService ?? previewDeleteComposeService,\n    commitComposeServiceMutation: dependencies.commitComposeServiceMutation ?? commitComposeServiceMutation,\n  };",
)
replace(
    'src/app/ui-server-service.ts',
    "    if (request.method === 'POST' && url.pathname === '/api/commands/preview') {",
    "    const serviceEditingMatch = matchStackServicesPath(url.pathname);\n\n    if (serviceEditingMatch !== undefined) {\n      const scanContext = await resolveStackScanContext(url, context);\n      const stacks = await scanProjects(scanContext, context.dependencies);\n      const project = findProject(stacks, serviceEditingMatch.stackId);\n\n      if (project === undefined) {\n        sendError(response, 404, 'stack-not-found', `Stack not found: ${serviceEditingMatch.stackId}`);\n        return;\n      }\n\n      if (request.method === 'GET' && serviceEditingMatch.action === 'list') {\n        sendJson(response, 200, await context.dependencies.listComposeServices({ composeFilePath: project.composeFilePath }));\n        return;\n      }\n\n      if (request.method === 'POST' && serviceEditingMatch.action === 'preview') {\n        const payload = parseServiceMutationPayload(await readRequestJson(request), project.composeFilePath);\n        const preview = payload.operation === 'create'\n          ? await context.dependencies.previewCreateComposeService(payload.input)\n          : payload.operation === 'update'\n            ? await context.dependencies.previewUpdateComposeService(payload.input)\n            : await context.dependencies.previewDeleteComposeService(payload.input);\n        sendJson(response, 200, preview);\n        return;\n      }\n\n      if (request.method === 'POST' && serviceEditingMatch.action === 'commit') {\n        const payload = parseServiceCommitPayload(await readRequestJson(request));\n        sendJson(response, 200, await context.dependencies.commitComposeServiceMutation(payload));\n        return;\n      }\n    }\n\n    if (request.method === 'POST' && url.pathname === '/api/commands/preview') {",
)
replace(
    'src/app/ui-server-service.ts',
    "function matchStackRuntimePath(pathname: string): string | undefined {\n  const match = /^\\/api\\/stacks\\/([^/]+)\\/runtime$/.exec(pathname);\n  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);\n}\n",
    "function matchStackRuntimePath(pathname: string): string | undefined {\n  const match = /^\\/api\\/stacks\\/([^/]+)\\/runtime$/.exec(pathname);\n  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);\n}\n\ntype StackServicesRoute = {\n  stackId: string;\n  action: 'list' | 'preview' | 'commit';\n};\n\nfunction matchStackServicesPath(pathname: string): StackServicesRoute | undefined {\n  const match = /^\\/api\\/stacks\\/([^/]+)\\/services(?:\\/(preview|commit))?$/.exec(pathname);\n  if (match?.[1] === undefined) {\n    return undefined;\n  }\n\n  return {\n    stackId: decodeURIComponent(match[1]),\n    action: match[2] === 'preview' || match[2] === 'commit' ? match[2] : 'list',\n  };\n}\n",
)
insert_before = "function readOptions(value: unknown): ComposeApplicationCommandOptions {"
service_parsers = r'''type ParsedServiceMutation =
  | { operation: 'create'; input: PreviewCreateComposeServiceInput }
  | { operation: 'update'; input: PreviewUpdateComposeServiceInput }
  | { operation: 'delete'; input: PreviewDeleteComposeServiceInput };

function parseServiceMutationPayload(value: unknown, composeFilePath: string): ParsedServiceMutation {
  if (!isObject(value)) {
    throw new LocalUiHttpError(400, 'invalid-json', 'Service mutation request body must be a JSON object.');
  }

  const operation = readRequiredString(value.operation, 'operation');

  if (operation === 'create') {
    if (!isObject(value.service)) {
      throw new LocalUiHttpError(400, 'invalid-service', 'Create operation requires a service object.');
    }

    return {
      operation,
      input: {
        composeFilePath,
        service: value.service as PreviewCreateComposeServiceInput['service'],
        overwrite: value.overwrite === true,
      },
    };
  }

  if (operation === 'update') {
    if (!isObject(value.patch)) {
      throw new LocalUiHttpError(400, 'invalid-service-patch', 'Update operation requires a patch object.');
    }

    return {
      operation,
      input: {
        composeFilePath,
        serviceName: readRequiredString(value.serviceName, 'serviceName'),
        patch: value.patch as PreviewUpdateComposeServiceInput['patch'],
      },
    };
  }

  if (operation === 'delete') {
    return {
      operation,
      input: {
        composeFilePath,
        serviceName: readRequiredString(value.serviceName, 'serviceName'),
      },
    };
  }

  throw new LocalUiHttpError(400, 'invalid-operation', 'Service operation must be create, update or delete.');
}

function parseServiceCommitPayload(value: unknown): CommitComposeServiceMutationInput {
  if (!isObject(value) || !isObject(value.preview)) {
    throw new LocalUiHttpError(400, 'invalid-preview', 'Commit request requires a preview object.');
  }

  return { preview: value.preview as unknown as ComposeServiceMutationPreview };
}

'''
replace('src/app/ui-server-service.ts', insert_before, service_parsers + insert_before)

# UI API contracts.
append('src/ui/api.ts', r'''
export type ComposeEnvironmentEntry = {
  name: string;
  value: string;
};

export type ComposeServiceForm = {
  name: string;
  image?: string;
  build?: string;
  ports?: string[];
  environment?: ComposeEnvironmentEntry[];
  volumes?: string[];
  dependsOn?: string[];
  command?: string;
  restart?: string;
};

export type EditableComposeService = {
  name: string;
  image?: string;
  build?: string | Record<string, unknown>;
  ports: string[];
  environment: ComposeEnvironmentEntry[];
  volumes: string[];
  dependsOn: string[];
  command?: string | string[];
  restart?: string;
  readOnlyKeys: string[];
  preservedKeys: string[];
};

export type ComposeServiceListResult = {
  composeFilePath: string;
  contentHash: string;
  services: EditableComposeService[];
};

export type ComposeServiceMutationPreview = {
  operation: 'create' | 'update' | 'delete';
  composeFilePath: string;
  serviceName: string;
  originalContentHash: string;
  beforeYaml?: string;
  afterYaml?: string;
  diff: string;
  nextContent: string;
  validation: { success: true; errors: [] };
  warnings: string[];
};

export type ComposeServiceMutationCommitResult = {
  composeFilePath: string;
  operation: 'create' | 'update' | 'delete';
  serviceName: string;
  contentHash: string;
};
''')

# Dedicated guided service editor component.
Path('src/ui/ServicesView.tsx').write_text(r'''import { useEffect, useMemo, useState } from 'react';
import {
  apiGet,
  apiPost,
  type ComposeEnvironmentEntry,
  type ComposeServiceForm,
  type ComposeServiceListResult,
  type ComposeServiceMutationCommitResult,
  type ComposeServiceMutationPreview,
  type DiscoveredComposeProject,
  type EditableComposeService,
} from './api';

type Props = {
  token: string;
  project?: DiscoveredComposeProject;
  onChooseStack: () => void;
  onCommitted: () => Promise<void> | void;
};

type Mode = 'create' | 'update' | 'delete';

type FormState = {
  name: string;
  image: string;
  build: string;
  ports: string;
  environment: string;
  volumes: string;
  dependsOn: string;
  command: string;
  restart: string;
};

const emptyForm: FormState = {
  name: '',
  image: '',
  build: '',
  ports: '',
  environment: '',
  volumes: '',
  dependsOn: '',
  command: '',
  restart: '',
};

export function ServicesView({ token, project, onChooseStack, onCommitted }: Props) {
  const [services, setServices] = useState<ComposeServiceListResult>();
  const [mode, setMode] = useState<Mode>('create');
  const [selectedName, setSelectedName] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [preview, setPreview] = useState<ComposeServiceMutationPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const selectedService = useMemo(
    () => services?.services.find((service) => service.name === selectedName),
    [selectedName, services],
  );

  async function loadServices() {
    if (project === undefined) {
      setServices(undefined);
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      const result = await apiGet<ComposeServiceListResult>(token, endpoint(project, ''));
      setServices(result);
      setSelectedName((current) => result.services.some((service) => service.name === current) ? current : result.services[0]?.name ?? '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Compose services.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setPreview(undefined);
    setMessage(undefined);
    setForm(emptyForm);
    void loadServices();
  }, [project?.id, token]);

  useEffect(() => {
    if (mode === 'create') {
      setForm(emptyForm);
      return;
    }

    if (selectedService !== undefined) {
      setForm(toFormState(selectedService));
    }
  }, [mode, selectedService]);

  async function createPreview() {
    if (project === undefined) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    setPreview(undefined);

    try {
      const payload = mode === 'create'
        ? { operation: 'create', service: toServiceForm(form) }
        : mode === 'update'
          ? { operation: 'update', serviceName: selectedName, patch: toServicePatch(form) }
          : { operation: 'delete', serviceName: selectedName };
      setPreview(await apiPost<ComposeServiceMutationPreview>(token, endpoint(project, '/preview'), payload));
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Unable to preview service changes.');
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (project === undefined || preview === undefined) return;
    setBusy(true);
    setError(undefined);

    try {
      const result = await apiPost<ComposeServiceMutationCommitResult>(token, endpoint(project, '/commit'), { preview });
      setMessage(`${capitalize(result.operation)} service ${result.serviceName} completed.`);
      setPreview(undefined);
      await loadServices();
      await onCommitted();
      if (result.operation === 'delete') setMode('create');
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : 'Unable to save Compose changes.');
    } finally {
      setBusy(false);
    }
  }

  if (project === undefined) {
    return (
      <div className="view-stack">
        <section className="panel empty-action">
          <div className="empty-state"><strong>Select a stack before editing services</strong><span>The guided editor needs a Compose file target.</span></div>
          <button type="button" onClick={onChooseStack}>Choose a stack</button>
        </section>
      </div>
    );
  }

  return (
    <div className="view-stack service-editor-view">
      <section className="hero-panel compact-hero">
        <div>
          <p className="eyebrow">Guided Compose editing</p>
          <h2>Edit services without writing YAML by hand.</h2>
          <p className="muted">Common fields are guided. Unsupported keys remain preserved. Every change is previewed before writing.</p>
        </div>
        <div className="hero-actions">
          <span className="status-pill ok">{project.name}</span>
          <button className="secondary" type="button" onClick={() => void loadServices()} disabled={busy}>Refresh</button>
        </div>
      </section>

      <section className="grid two-columns service-editor-grid">
        <article className="panel">
          <div className="panel-heading"><div><h3>Service operation</h3><p>{services?.composeFilePath ?? project.composeFilePath}</p></div></div>
          <div className="service-mode-tabs">
            {(['create', 'update', 'delete'] as const).map((value) => (
              <button key={value} className={mode === value ? 'secondary active' : 'secondary'} type="button" onClick={() => { setMode(value); setPreview(undefined); setError(undefined); }}>
                {capitalize(value)}
              </button>
            ))}
          </div>

          {mode === 'create' ? null : (
            <label>Existing service<select value={selectedName} onChange={(event) => { setSelectedName(event.target.value); setPreview(undefined); }}>
              {(services?.services ?? []).map((service) => <option key={service.name} value={service.name}>{service.name}</option>)}
            </select></label>
          )}

          {mode === 'delete' ? (
            <div className="danger-zone"><strong>Delete {selectedName}</strong><p>The service definition will be removed after preview and confirmation. Other top-level Compose sections remain untouched.</p></div>
          ) : (
            <ServiceForm form={form} setForm={setForm} nameLocked={mode === 'update'} />
          )}

          {selectedService === undefined || mode === 'create' ? null : (
            <div className="preserved-keys">
              <small>Preserved advanced keys</small>
              <span>{[...selectedService.readOnlyKeys, ...selectedService.preservedKeys].join(', ') || 'None'}</span>
            </div>
          )}

          <div className="actions">
            <button type="button" onClick={() => void createPreview()} disabled={busy || (mode !== 'create' && selectedName.length === 0)}>{busy ? 'Working...' : 'Preview YAML changes'}</button>
            {preview === undefined ? null : <button className="ghost" type="button" onClick={() => setPreview(undefined)} disabled={busy}>Discard preview</button>}
          </div>
          {error === undefined ? null : <div className="banner danger">{error}</div>}
          {message === undefined ? null : <div className="banner info">{message}</div>}
        </article>

        <article className="panel preview-panel">
          <div className="panel-heading"><div><h3>YAML diff preview</h3><p>Review the exact generated change before saving.</p></div></div>
          {preview === undefined ? (
            <div className="empty-state"><strong>No preview yet</strong><span>Complete the guided form, then generate a preview.</span></div>
          ) : (
            <>
              {preview.warnings.length === 0 ? null : <div className="banner warning">{preview.warnings.join(' · ')}</div>}
              <pre className="yaml-diff" aria-label="Compose YAML diff">{preview.diff}</pre>
              <label className="confirm-row"><input type="checkbox" id="service-save-confirmation" /> I reviewed this YAML diff.</label>
              <button type="button" onClick={() => {
                const confirmation = document.querySelector<HTMLInputElement>('#service-save-confirmation');
                if (confirmation?.checked === true) void commit(); else setError('Review and confirm the YAML diff before saving.');
              }} disabled={busy}>Save Compose file</button>
            </>
          )}
        </article>
      </section>
    </div>
  );
}

function ServiceForm({ form, setForm, nameLocked }: { form: FormState; setForm: (value: FormState) => void; nameLocked: boolean }) {
  const field = (key: keyof FormState, value: string) => setForm({ ...form, [key]: value });
  return <div className="compose-service-form">
    <label>Service name<input value={form.name} disabled={nameLocked} placeholder="api" onChange={(event) => field('name', event.target.value)} /></label>
    <label>Image<input value={form.image} placeholder="nginx:alpine" onChange={(event) => field('image', event.target.value)} /></label>
    <label>Build context<input value={form.build} placeholder="./src/api" onChange={(event) => field('build', event.target.value)} /></label>
    <label>Ports<textarea value={form.ports} placeholder={'8080:80\n8443:443'} onChange={(event) => field('ports', event.target.value)} /></label>
    <label>Environment<textarea value={form.environment} placeholder={'ASPNETCORE_ENVIRONMENT=Development\nLOG_LEVEL=info'} onChange={(event) => field('environment', event.target.value)} /></label>
    <label>Volumes<textarea value={form.volumes} placeholder={'./data:/app/data'} onChange={(event) => field('volumes', event.target.value)} /></label>
    <label>Depends on<textarea value={form.dependsOn} placeholder={'db\nredis'} onChange={(event) => field('dependsOn', event.target.value)} /></label>
    <label>Command<input value={form.command} placeholder="npm run start" onChange={(event) => field('command', event.target.value)} /></label>
    <label>Restart policy<select value={form.restart} onChange={(event) => field('restart', event.target.value)}><option value="">Default</option><option value="no">no</option><option value="always">always</option><option value="on-failure">on-failure</option><option value="unless-stopped">unless-stopped</option></select></label>
  </div>;
}

function endpoint(project: DiscoveredComposeProject, suffix: string): string {
  return `/api/stacks/${encodeURIComponent(project.id)}/services${suffix}`;
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
}

function environment(value: string): ComposeEnvironmentEntry[] {
  return lines(value).map((entry) => {
    const separator = entry.indexOf('=');
    return separator < 1 ? { name: entry, value: '' } : { name: entry.slice(0, separator), value: entry.slice(separator + 1) };
  });
}

function toServiceForm(form: FormState): ComposeServiceForm {
  return {
    name: form.name.trim(),
    ...(form.image.trim() === '' ? {} : { image: form.image.trim() }),
    ...(form.build.trim() === '' ? {} : { build: form.build.trim() }),
    ports: lines(form.ports),
    environment: environment(form.environment),
    volumes: lines(form.volumes),
    dependsOn: lines(form.dependsOn),
    ...(form.command.trim() === '' ? {} : { command: form.command.trim() }),
    ...(form.restart === '' ? {} : { restart: form.restart }),
  };
}

function toServicePatch(form: FormState): Omit<ComposeServiceForm, 'name'> {
  const { name: _name, ...patch } = toServiceForm(form);
  return patch;
}

function toFormState(service: EditableComposeService): FormState {
  return {
    name: service.name,
    image: service.image ?? '',
    build: typeof service.build === 'string' ? service.build : '',
    ports: service.ports.join('\n'),
    environment: service.environment.map((entry) => `${entry.name}=${entry.value}`).join('\n'),
    volumes: service.volumes.join('\n'),
    dependsOn: service.dependsOn.join('\n'),
    command: Array.isArray(service.command) ? service.command.join(' ') : service.command ?? '',
    restart: service.restart ?? '',
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
''', encoding='utf-8')

# App integration: new navigation entry and view.
replace(
    'src/ui/App.tsx',
    "import { useEffect, useMemo, useState } from 'react';\n",
    "import { useEffect, useMemo, useState } from 'react';\nimport { ServicesView } from './ServicesView';\n",
)
replace(
    'src/ui/App.tsx',
    "type AppView = 'dashboard' | 'workspaces' | 'stacks' | 'doctor' | 'commands';",
    "type AppView = 'dashboard' | 'workspaces' | 'stacks' | 'services' | 'doctor' | 'commands';",
)
replace(
    'src/ui/App.tsx',
    "        {activeView === 'doctor' ? <DoctorView report={state.doctor} loading={state.loading} /> : null}\n",
    "        {activeView === 'services' ? (\n          <ServicesView\n            token={token}\n            project={selectedProject}\n            onChooseStack={() => setActiveView('stacks')}\n            onCommitted={load}\n          />\n        ) : null}\n\n        {activeView === 'doctor' ? <DoctorView report={state.doctor} loading={state.loading} /> : null}\n",
)
replace(
    'src/ui/App.tsx',
    "        <NavButton active={activeView === 'stacks'} label=\"Stacks\" description={`${summary.stackCount} projects`} onClick={() => setActiveView('stacks')} />\n        <NavButton active={activeView === 'doctor'}",
    "        <NavButton active={activeView === 'stacks'} label=\"Stacks\" description={`${summary.stackCount} projects`} onClick={() => setActiveView('stacks')} />\n        <NavButton active={activeView === 'services'} label=\"Services\" description=\"Guided YAML editor\" onClick={() => setActiveView('services')} />\n        <NavButton active={activeView === 'doctor'}",
)

append('src/ui/styles.css', r'''
.service-editor-grid { align-items: start; }
.service-mode-tabs { display: flex; gap: .5rem; margin-bottom: 1rem; }
.service-mode-tabs .active { border-color: var(--accent, #60a5fa); box-shadow: 0 0 0 1px var(--accent, #60a5fa); }
.compose-service-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .9rem; margin: 1rem 0; }
.compose-service-form label { min-width: 0; }
.compose-service-form textarea { min-height: 5.5rem; resize: vertical; }
.preview-panel { min-height: 34rem; }
.yaml-diff { max-height: 34rem; overflow: auto; white-space: pre; padding: 1rem; border-radius: .75rem; background: #07111f; color: #dbeafe; font-size: .78rem; line-height: 1.45; }
.confirm-row { display: flex; flex-direction: row; align-items: center; gap: .6rem; margin: 1rem 0; }
.confirm-row input { width: auto; }
.preserved-keys { display: flex; flex-direction: column; gap: .25rem; margin: .75rem 0; padding: .75rem; border: 1px solid rgba(148,163,184,.2); border-radius: .75rem; }
.danger-zone { margin: 1rem 0; padding: 1rem; border: 1px solid rgba(248,113,113,.45); border-radius: .75rem; background: rgba(127,29,29,.16); }
@media (max-width: 860px) { .compose-service-form { grid-template-columns: 1fr; } }
''')

# API tests for the editing endpoints.
replace(
    'tests/unit/ui-server-service.test.ts',
    "import type { WorkspaceDefinition } from '../../src/workspace/workspace-config.js';\n",
    "import type { WorkspaceDefinition } from '../../src/workspace/workspace-config.js';\nimport type { ComposeServiceMutationPreview } from '../../src/yaml/compose-service-editor.js';\n",
)
replace(
    'tests/unit/ui-server-service.test.ts',
    "    executeCommand: async (input: ComposeApplicationCommandInput): Promise<ComposeApplicationCommandResult> => ({",
    "    listComposeServices: async () => ({\n      composeFilePath: project.composeFilePath,\n      contentHash: 'hash-before',\n      services: [{\n        name: 'api', image: 'example/api:latest', ports: ['8080:8080'], environment: [], volumes: [], dependsOn: [], readOnlyKeys: [], preservedKeys: [],\n      }],\n    }),\n    previewCreateComposeService: async (input) => createServicePreview('create', input.service.name),\n    previewUpdateComposeService: async (input) => createServicePreview('update', input.serviceName),\n    previewDeleteComposeService: async (input) => createServicePreview('delete', input.serviceName),\n    commitComposeServiceMutation: async (input) => ({\n      composeFilePath: input.preview.composeFilePath, operation: input.preview.operation, serviceName: input.preview.serviceName, contentHash: 'hash-after',\n    }),\n    executeCommand: async (input: ComposeApplicationCommandInput): Promise<ComposeApplicationCommandResult> => ({",
)
replace(
    'tests/unit/ui-server-service.test.ts',
    "describe('local UI server application service', () => {",
    "function createServicePreview(operation: ComposeServiceMutationPreview['operation'], serviceName: string): ComposeServiceMutationPreview {\n  return {\n    operation, composeFilePath: project.composeFilePath, serviceName, originalContentHash: 'hash-before',\n    diff: `--- before\\n+++ after\\n+${serviceName}`, nextContent: `services:\\n  ${serviceName}: {}`,\n    validation: { success: true, errors: [] }, warnings: [],\n  };\n}\n\ndescribe('local UI server application service', () => {",
)
replace(
    'tests/unit/ui-server-service.test.ts',
    "  it('previews commands and requires confirmation before execution', async () => {",
    "  it('lists, previews and commits guided Compose service mutations', async () => {\n    const server = await startTestServer();\n\n    try {\n      const listed = await getJson(server, `/api/stacks/${encodeURIComponent(project.id)}/services`);\n      const preview = await postJson(server, `/api/stacks/${encodeURIComponent(project.id)}/services/preview`, {\n        operation: 'create', service: { name: 'worker', image: 'example/worker:latest' },\n      });\n      const committed = await postJson(server, `/api/stacks/${encodeURIComponent(project.id)}/services/commit`, { preview });\n\n      expect(listed).toMatchObject({ composeFilePath: project.composeFilePath, contentHash: 'hash-before' });\n      expect((listed.services as Array<{ name: string }>)[0]?.name).toBe('api');\n      expect(preview).toMatchObject({ operation: 'create', serviceName: 'worker' });\n      expect(committed).toMatchObject({ operation: 'create', serviceName: 'worker', contentHash: 'hash-after' });\n    } finally {\n      await server.close();\n    }\n  });\n\n  it('previews commands and requires confirmation before execution', async () => {",
)

# Documentation and tracking.
append('CHANGELOG.md', r'''
### Added

- Add token-protected local UI endpoints for listing, previewing and committing guided Compose service mutations.
- Add a browser service editor for create, update and delete operations with YAML diff review before saving.
- Preserve unsupported service keys and reject commits when the Compose file changed after preview.
''')
append('docs/local-ui-server.md', r'''
## Guided service editing

The local UI exposes stack-scoped, token-protected endpoints:

- `GET /api/stacks/{stackId}/services`
- `POST /api/stacks/{stackId}/services/preview`
- `POST /api/stacks/{stackId}/services/commit`

The browser editor supports guided create, update and delete operations. It never writes immediately: the user first generates and reviews a YAML diff, explicitly confirms it, and only then commits. The application service content hash prevents saving a stale preview after the file changed on disk. Advanced and unsupported service keys are preserved.
''')
append('docs/gui-roadmap.md', r'''
## Compose service editing status

- [x] Shared Compose editing application service.
- [x] Token-protected stack service endpoints.
- [x] Guided browser forms for create, update and delete.
- [x] YAML diff preview and explicit save confirmation.
- [x] Optimistic file-change protection and advanced key preservation.
- [ ] Additional complex-file fixtures and UI-focused regression coverage (#43).
''')
append('docs/backlog.md', r'''
## Completed: guided Compose service editing (#42)

The local React UI now exposes the #41 editing engine through stack-scoped endpoints and guided create, update and delete workflows. Every mutation requires a generated YAML diff and explicit confirmation before disk write. Complex fixture hardening remains tracked as #43.
''')

print('Issue #42 implementation applied.')
