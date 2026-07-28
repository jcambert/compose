type StackListResult = {
  stacks: Array<{
    id: string;
    name: string;
    services: string[];
  }>;
};

type RuntimeStatus = {
  summary?: string;
  state?: string;
};

type LogEvent = {
  stream: 'stdout' | 'stderr';
  content: string;
};

type WidgetState = {
  stacks: StackListResult['stacks'];
  selectedStackId: string;
  selectedService: string;
  runtimeSource: EventSource | undefined;
  logSource: EventSource | undefined;
  output: string[];
  status: string;
};

const collapsedPreferenceKey = 'compose-ui.live-streams.collapsed';

export function mountStreamingWidget(token: string): void {
  if (token.length === 0 || document.getElementById('compose-streaming-widget') !== null) {
    return;
  }

  const root = document.createElement('section');
  root.id = 'compose-streaming-widget';
  root.className = readCollapsedPreference() ? 'streaming-widget collapsed' : 'streaming-widget';
  document.body.append(root);

  const state: WidgetState = {
    stacks: [],
    selectedStackId: '',
    selectedService: '',
    runtimeSource: undefined,
    logSource: undefined,
    output: [],
    status: 'Ready',
  };

  function closeRuntimeStream(): void {
    state.runtimeSource?.close();
    state.runtimeSource = undefined;
  }

  function closeLogStream(): void {
    state.logSource?.close();
    state.logSource = undefined;
  }

  function stopStreams(): void {
    closeRuntimeStream();
    closeLogStream();
  }

  function closeStreams(): void {
    stopStreams();
    state.status = 'Streams stopped';
    render();
  }

  function closePanel(): void {
    stopStreams();
    state.status = 'Panel closed';
    setCollapsed(true);
    render();
  }

  function append(line: string): void {
    state.output = [...state.output, line].slice(-250);
    render();
  }

  function selectedStack() {
    return state.stacks.find((stack) => stack.id === state.selectedStackId);
  }

  function selectStack(stackId: string, clearOutput: boolean): void {
    const stack = state.stacks.find((candidate) => candidate.id === stackId);

    if (stack === undefined) {
      return;
    }

    const changed = state.selectedStackId !== stack.id;
    state.selectedStackId = stack.id;
    state.selectedService = '';

    if (changed) {
      stopStreams();
      state.status = `Selected ${stack.name}`;
    }

    if (clearOutput) {
      state.output = [];
    }

    render();
  }

  function selectStackByName(name: string, clearOutput: boolean): void {
    const stack = state.stacks.find((candidate) => candidate.name === name);

    if (stack !== undefined) {
      selectStack(stack.id, clearOutput);
    }
  }

  async function loadStacks(): Promise<void> {
    state.status = 'Loading stacks...';
    render();

    try {
      const response = await fetch('/api/stacks', {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json() as StackListResult;
      const selectedPageStackName = readSelectedStackNameFromPage();
      const selectedPageStack = selectedPageStackName === undefined
        ? undefined
        : result.stacks.find((stack) => stack.name === selectedPageStackName);
      const currentStackStillExists = result.stacks.some((stack) => stack.id === state.selectedStackId);
      const fallbackStackId = selectedPageStack?.id ?? (currentStackStillExists ? state.selectedStackId : result.stacks[0]?.id ?? '');
      const changed = state.selectedStackId !== '' && state.selectedStackId !== fallbackStackId;

      state.stacks = result.stacks;
      state.selectedStackId = fallbackStackId;
      state.status = result.stacks.length === 0 ? 'No stack available' : 'Ready';

      if (changed) {
        stopStreams();
        state.output = [];
      }
    } catch (error) {
      state.status = error instanceof Error ? error.message : 'Unable to load stacks';
    }

    render();
  }

  function startRuntime(): void {
    const stack = selectedStack();

    if (stack === undefined) {
      state.status = 'Select a stack first';
      render();
      return;
    }

    setCollapsed(false);
    closeRuntimeStream();
    const params = new URLSearchParams({ token, stackId: stack.id, intervalMs: '5000' });
    const source = new EventSource(`/api/events/runtime?${params.toString()}`);
    state.runtimeSource = source;
    state.status = `Runtime stream: ${stack.name}`;
    append(`[runtime] connecting to ${stack.name}`);

    source.addEventListener('runtime', (event) => {
      const payload = readSse<RuntimeStatus>(event);
      append(`[runtime] ${payload?.summary ?? payload?.state ?? 'status updated'}`);
    });
    source.addEventListener('runtime-error', (event) => {
      const payload = readSse<{ message?: string }>(event);
      append(`[runtime:error] ${payload?.message ?? 'stream error'}`);
    });
    source.onerror = () => {
      state.status = 'Runtime stream disconnected';
      render();
    };

    render();
  }

  function startLogs(): void {
    const stack = selectedStack();

    if (stack === undefined) {
      state.status = 'Select a stack first';
      render();
      return;
    }

    setCollapsed(false);
    closeLogStream();
    const params = new URLSearchParams({ token, stackId: stack.id, tail: '200' });

    if (state.selectedService.length > 0) {
      params.set('service', state.selectedService);
    }

    const source = new EventSource(`/api/logs/stream?${params.toString()}`);
    state.logSource = source;
    state.status = `Log stream: ${stack.name}`;
    append(`[logs] connecting to ${stack.name}${state.selectedService.length === 0 ? '' : `/${state.selectedService}`}`);

    source.addEventListener('log', (event) => {
      const payload = readSse<LogEvent>(event);

      if (payload === undefined) {
        return;
      }

      for (const line of payload.content.split(/\r?\n/).filter((item) => item.trim().length > 0)) {
        append(`[${payload.stream}] ${line}`);
      }
    });
    source.addEventListener('logs-complete', () => {
      append('[logs] stream completed');
      closeLogStream();
    });
    source.addEventListener('logs-error', (event) => {
      const payload = readSse<{ message?: string }>(event);
      append(`[logs:error] ${payload?.message ?? 'stream error'}`);
    });
    source.onerror = () => {
      state.status = 'Log stream disconnected';
      render();
    };

    render();
  }

  function toggle(): void {
    const nextCollapsed = !root.classList.contains('collapsed');

    if (!nextCollapsed) {
      syncFromPageSelection(true);
    }

    setCollapsed(nextCollapsed);
  }

  function setCollapsed(collapsed: boolean): void {
    root.classList.toggle('collapsed', collapsed);
    writeCollapsedPreference(collapsed);
  }

  function syncFromPageSelection(clearOutput: boolean): void {
    const selectedPageStackName = readSelectedStackNameFromPage();

    if (selectedPageStackName !== undefined) {
      selectStackByName(selectedPageStackName, clearOutput);
    }
  }

  function render(): void {
    const stack = selectedStack();
    const serviceOptions = stack?.services ?? [];

    root.innerHTML = `
      <button class="streaming-widget-toggle" type="button">Live streams</button>
      <div class="streaming-widget-panel" role="dialog" aria-label="Live streams">
        <div class="streaming-widget-header">
          <div class="streaming-widget-title">
            <strong>Live streams</strong>
            <small>${escapeHtml(state.status)}</small>
          </div>
          <button class="streaming-widget-close" type="button" data-action="close" aria-label="Close Live streams panel">×</button>
        </div>
        <label>
          Stack
          <select data-role="stack">
            ${state.stacks.length === 0 ? '<option value="">No stack</option>' : state.stacks.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === state.selectedStackId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
          </select>
        </label>
        <label>
          Service logs
          <select data-role="service">
            <option value="">All services</option>
            ${serviceOptions.map((service) => `<option value="${escapeHtml(service)}" ${service === state.selectedService ? 'selected' : ''}>${escapeHtml(service)}</option>`).join('')}
          </select>
        </label>
        <div class="streaming-widget-actions">
          <button type="button" data-action="reload">Reload stacks</button>
          <button type="button" data-action="runtime">Runtime</button>
          <button type="button" data-action="logs">Logs</button>
          <button type="button" data-action="stop">Stop</button>
        </div>
        <pre class="streaming-widget-output">${escapeHtml(state.output.length === 0 ? 'No live event yet.' : state.output.join('\n'))}</pre>
      </div>
    `;

    root.querySelector<HTMLButtonElement>('.streaming-widget-toggle')?.addEventListener('click', toggle);
    root.querySelector<HTMLButtonElement>('[data-action="close"]')?.addEventListener('click', closePanel);
    root.querySelector<HTMLSelectElement>('[data-role="stack"]')?.addEventListener('change', (event) => {
      selectStack(event.currentTarget.value, true);
    });
    root.querySelector<HTMLSelectElement>('[data-role="service"]')?.addEventListener('change', (event) => {
      state.selectedService = event.currentTarget.value;
      render();
    });
    root.querySelector<HTMLButtonElement>('[data-action="reload"]')?.addEventListener('click', () => void loadStacks());
    root.querySelector<HTMLButtonElement>('[data-action="runtime"]')?.addEventListener('click', startRuntime);
    root.querySelector<HTMLButtonElement>('[data-action="logs"]')?.addEventListener('click', startLogs);
    root.querySelector<HTMLButtonElement>('[data-action="stop"]')?.addEventListener('click', closeStreams);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !root.classList.contains('collapsed')) {
      closePanel();
    }
  }

  function handleDocumentClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : undefined;
    const stackCard = target?.closest('.stack-card');

    if (stackCard === undefined || stackCard === null) {
      return;
    }

    const stackName = stackCard.querySelector('strong')?.textContent?.trim();

    if (stackName === undefined || stackName.length === 0) {
      return;
    }

    window.setTimeout(() => selectStackByName(stackName, true), 0);
  }

  window.addEventListener('keydown', handleKeydown);
  document.addEventListener('click', handleDocumentClick, true);
  window.addEventListener('beforeunload', closeStreams);
  render();
  void loadStacks();
}

function readSse<T>(event: Event): T | undefined {
  try {
    return JSON.parse((event as MessageEvent).data as string) as T;
  } catch {
    return undefined;
  }
}

function readSelectedStackNameFromPage(): string | undefined {
  const value = document.querySelector('.stack-card.selected strong')?.textContent?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function readCollapsedPreference(): boolean {
  try {
    return window.sessionStorage.getItem(collapsedPreferenceKey) !== 'false';
  } catch {
    return true;
  }
}

function writeCollapsedPreference(collapsed: boolean): void {
  try {
    window.sessionStorage.setItem(collapsedPreferenceKey, collapsed ? 'true' : 'false');
  } catch {
    // Ignore storage failures. The widget still works without persistence.
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
