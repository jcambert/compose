import { useEffect, useMemo, useState } from 'react';
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
  const service = toServiceForm(form);
  return {
    ...(service.image === undefined ? {} : { image: service.image }),
    ...(service.build === undefined ? {} : { build: service.build }),
    ports: service.ports,
    environment: service.environment,
    volumes: service.volumes,
    dependsOn: service.dependsOn,
    ...(service.command === undefined ? {} : { command: service.command }),
    ...(service.restart === undefined ? {} : { restart: service.restart }),
  };
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
