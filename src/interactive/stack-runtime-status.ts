import { dirname } from 'node:path';
import { execa } from 'execa';
import type { DiscoveredComposeProject } from '../scanner/discovered-project.js';

export type ServiceRuntimeState = 'running' | 'stopped' | 'exited' | 'unhealthy' | 'unknown';

export type StackRuntimeState = 'running' | 'partial' | 'stopped' | 'unavailable' | 'unknown';

export type StackRuntimeStatusOptions = {
  dryRun?: boolean;
  noAnsi?: boolean;
  projectName?: string;
  profile?: string[];
};

export type ServiceRuntimeStatus = {
  serviceName: string;
  state: ServiceRuntimeState;
  containerCount: number;
  ports: string[];
  containerNames: string[];
  health?: string;
};

export type StackRuntimeStatus = {
  projectId: string;
  composeFilePath: string;
  available: boolean;
  state: StackRuntimeState;
  services: Record<string, ServiceRuntimeStatus>;
  runningServices: number;
  stoppedServices: number;
  unhealthyServices: number;
  unknownServices: number;
  summary: string;
  warning?: string;
};

export type RuntimeStatusCommand = {
  binary: 'docker';
  args: string[];
  cwd: string;
  displayCommand: string;
};

export type RuntimeStatusRunner = (
  binary: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export type RuntimeStatusExecaOptions = {
  cwd: string;
  reject: false;
};

export type RuntimeStatusExecaResultLike = {
  exitCode?: number | null;
  stdout?: unknown;
  stderr?: unknown;
};

export type RuntimeStatusExecaLike = (
  binary: string,
  args: string[],
  options: RuntimeStatusExecaOptions,
) => Promise<RuntimeStatusExecaResultLike>;

const defaultRuntimeStatusRunner = createExecaRuntimeStatusRunner(execa as unknown as RuntimeStatusExecaLike);

export async function readStackRuntimeStatus(
  project: DiscoveredComposeProject,
  options: StackRuntimeStatusOptions,
  runner: RuntimeStatusRunner = defaultRuntimeStatusRunner,
): Promise<StackRuntimeStatus> {
  if (options.dryRun === true) {
    return createUnavailableStackRuntimeStatus(project, 'Runtime status is disabled in dry-run mode.');
  }

  const command = buildComposePsJsonCommand(project, options);

  try {
    const result = await runner(command.binary, command.args, { cwd: command.cwd });

    if (result.exitCode !== 0) {
      return createUnavailableStackRuntimeStatus(project, result.stderr || `Unable to read runtime status with ${command.displayCommand}.`);
    }

    return createStackRuntimeStatus(project, parseComposePsJsonOutput(result.stdout, project.services));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Docker runtime status is unavailable.';
    return createUnavailableStackRuntimeStatus(project, message);
  }
}

export function buildComposePsJsonCommand(
  project: DiscoveredComposeProject,
  options: StackRuntimeStatusOptions,
): RuntimeStatusCommand {
  const args = ['compose', '-f', project.composeFilePath];

  addValueOption(args, '--project-name', options.projectName);
  addRepeatableOption(args, '--profile', options.profile);

  if (options.noAnsi === true) {
    args.push('--ansi=never');
  }

  args.push('ps', '--format', 'json');

  return {
    binary: 'docker',
    args,
    cwd: dirname(project.composeFilePath),
    displayCommand: ['docker', ...args].join(' '),
  };
}

export function parseComposePsJsonOutput(output: string, knownServiceNames: string[]): ServiceRuntimeStatus[] {
  const rows = parseComposePsRows(output);
  const groupedRows = groupRowsByService(rows);
  const serviceNames = Array.from(new Set([...knownServiceNames, ...groupedRows.keys()])).sort();

  return serviceNames.map((serviceName) => aggregateServiceRuntimeStatus(serviceName, groupedRows.get(serviceName) ?? []));
}

export function createStackRuntimeStatus(
  project: DiscoveredComposeProject,
  serviceStatuses: ServiceRuntimeStatus[],
): StackRuntimeStatus {
  const services = Object.fromEntries(serviceStatuses.map((serviceStatus) => [serviceStatus.serviceName, serviceStatus]));
  const runningServices = serviceStatuses.filter((serviceStatus) => serviceStatus.state === 'running').length;
  const stoppedServices = serviceStatuses.filter((serviceStatus) => serviceStatus.state === 'stopped' || serviceStatus.state === 'exited').length;
  const unhealthyServices = serviceStatuses.filter((serviceStatus) => serviceStatus.state === 'unhealthy').length;
  const unknownServices = serviceStatuses.filter((serviceStatus) => serviceStatus.state === 'unknown').length;
  const state = resolveStackRuntimeState(serviceStatuses, runningServices, stoppedServices, unhealthyServices, unknownServices);
  const summary = formatStackRuntimeSummary({
    runningServices,
    stoppedServices,
    unhealthyServices,
    unknownServices,
    totalServices: serviceStatuses.length,
  });

  return {
    projectId: project.id,
    composeFilePath: project.composeFilePath,
    available: true,
    state,
    services,
    runningServices,
    stoppedServices,
    unhealthyServices,
    unknownServices,
    summary,
  };
}

export function createUnavailableStackRuntimeStatus(project: DiscoveredComposeProject, warning: string): StackRuntimeStatus {
  return {
    projectId: project.id,
    composeFilePath: project.composeFilePath,
    available: false,
    state: 'unavailable',
    services: {},
    runningServices: 0,
    stoppedServices: 0,
    unhealthyServices: 0,
    unknownServices: project.services.length,
    summary: 'runtime status unavailable',
    warning,
  };
}

export function formatServiceRuntimeSummary(serviceStatus: ServiceRuntimeStatus | undefined): string {
  if (serviceStatus === undefined) {
    return 'status unknown';
  }

  const ports = serviceStatus.ports.length === 0 ? '' : ` · ${serviceStatus.ports.join(', ')}`;
  const containers = serviceStatus.containerCount === 1 ? '1 container' : `${serviceStatus.containerCount} containers`;

  return `${serviceStatus.state} · ${containers}${ports}`;
}

export function createExecaRuntimeStatusRunner(execaRunner: RuntimeStatusExecaLike): RuntimeStatusRunner {
  return async (
    binary: string,
    args: string[],
    options: { cwd: string },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
    const result = await execaRunner(binary, args, {
      cwd: options.cwd,
      reject: false,
    });

    return {
      exitCode: result.exitCode ?? 0,
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr: typeof result.stderr === 'string' ? result.stderr : '',
    };
  };
}

type ComposePsRow = Record<string, unknown>;

type StackRuntimeSummaryInput = {
  runningServices: number;
  stoppedServices: number;
  unhealthyServices: number;
  unknownServices: number;
  totalServices: number;
};

function parseComposePsRows(output: string): ComposePsRow[] {
  const trimmedOutput = output.trim();

  if (trimmedOutput.length === 0) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(trimmedOutput) as unknown;
    return toComposePsRows(parsedValue);
  } catch {
    return trimmedOutput
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as unknown)
      .flatMap(toComposePsRows);
  }
}

function toComposePsRows(value: unknown): ComposePsRow[] {
  if (Array.isArray(value)) {
    return value.filter(isComposePsRow);
  }

  return isComposePsRow(value) ? [value] : [];
}

function isComposePsRow(value: unknown): value is ComposePsRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function groupRowsByService(rows: ComposePsRow[]): Map<string, ComposePsRow[]> {
  const groupedRows = new Map<string, ComposePsRow[]>();

  for (const row of rows) {
    const serviceName = getStringValue(row, ['Service', 'service', 'SERVICE']) ?? getStringValue(row, ['Name', 'name']) ?? 'unknown';
    const currentRows = groupedRows.get(serviceName) ?? [];
    currentRows.push(row);
    groupedRows.set(serviceName, currentRows);
  }

  return groupedRows;
}

function aggregateServiceRuntimeStatus(serviceName: string, rows: ComposePsRow[]): ServiceRuntimeStatus {
  if (rows.length === 0) {
    return {
      serviceName,
      state: 'stopped',
      containerCount: 0,
      ports: [],
      containerNames: [],
    };
  }

  const rowStatuses = rows.map(toServiceRuntimeContainerStatus);
  const state = aggregateServiceRuntimeState(rowStatuses.map((rowStatus) => rowStatus.state));
  const health = rowStatuses.find((rowStatus) => rowStatus.health !== undefined)?.health;
  const ports = unique(rowStatuses.flatMap((rowStatus) => rowStatus.ports));
  const containerNames = unique(rowStatuses.flatMap((rowStatus) => (rowStatus.containerName === undefined ? [] : [rowStatus.containerName])));

  return {
    serviceName,
    state,
    containerCount: rows.length,
    ports,
    containerNames,
    ...(health === undefined ? {} : { health }),
  };
}

function toServiceRuntimeContainerStatus(row: ComposePsRow): {
  state: ServiceRuntimeState;
  ports: string[];
  containerName?: string;
  health?: string;
} {
  const stateText = [
    getStringValue(row, ['State', 'state']),
    getStringValue(row, ['Status', 'status']),
    getStringValue(row, ['Health', 'health']),
  ]
    .filter((part): part is string => part !== undefined)
    .join(' ');
  const health = getStringValue(row, ['Health', 'health']) ?? inferHealthFromText(stateText);
  const containerName = getStringValue(row, ['Name', 'name', 'ContainerName', 'containerName']);

  return {
    state: normalizeServiceRuntimeState(stateText),
    ports: extractPorts(row),
    ...(containerName === undefined ? {} : { containerName }),
    ...(health === undefined ? {} : { health }),
  };
}

function normalizeServiceRuntimeState(value: string): ServiceRuntimeState {
  const normalizedValue = value.toLowerCase();

  if (normalizedValue.includes('unhealthy')) {
    return 'unhealthy';
  }

  if (normalizedValue.includes('running') || normalizedValue.includes('up')) {
    return 'running';
  }

  if (normalizedValue.includes('exited')) {
    return 'exited';
  }

  if (normalizedValue.includes('stopped') || normalizedValue.includes('created') || normalizedValue.includes('dead')) {
    return 'stopped';
  }

  return 'unknown';
}

function aggregateServiceRuntimeState(states: ServiceRuntimeState[]): ServiceRuntimeState {
  if (states.includes('unhealthy')) {
    return 'unhealthy';
  }

  if (states.includes('running')) {
    return 'running';
  }

  if (states.includes('exited')) {
    return 'exited';
  }

  if (states.includes('stopped')) {
    return 'stopped';
  }

  return 'unknown';
}

function resolveStackRuntimeState(
  serviceStatuses: ServiceRuntimeStatus[],
  runningServices: number,
  stoppedServices: number,
  unhealthyServices: number,
  unknownServices: number,
): StackRuntimeState {
  if (serviceStatuses.length === 0 || unknownServices === serviceStatuses.length) {
    return 'unknown';
  }

  if (unhealthyServices > 0) {
    return 'partial';
  }

  if (runningServices === serviceStatuses.length) {
    return 'running';
  }

  if (runningServices > 0) {
    return 'partial';
  }

  if (stoppedServices === serviceStatuses.length) {
    return 'stopped';
  }

  return 'unknown';
}

function formatStackRuntimeSummary(input: StackRuntimeSummaryInput): string {
  if (input.totalServices === 0) {
    return 'no services';
  }

  const parts = [
    `${input.runningServices} running`,
    `${input.stoppedServices} stopped`,
  ];

  if (input.unhealthyServices > 0) {
    parts.push(`${input.unhealthyServices} unhealthy`);
  }

  if (input.unknownServices > 0) {
    parts.push(`${input.unknownServices} unknown`);
  }

  return parts.join(' · ');
}

function extractPorts(row: ComposePsRow): string[] {
  const directPorts = getStringValue(row, ['Ports', 'ports']);

  if (directPorts !== undefined && directPorts.length > 0) {
    return [directPorts];
  }

  const publishers = getUnknownValue(row, ['Publishers', 'publishers']);

  if (!Array.isArray(publishers)) {
    return [];
  }

  return publishers
    .map(formatPublisher)
    .filter((publisher): publisher is string => publisher !== undefined);
}

function formatPublisher(publisher: unknown): string | undefined {
  if (!isComposePsRow(publisher)) {
    return undefined;
  }

  const url = getStringValue(publisher, ['URL', 'url']);
  const publishedPort = getPortValue(publisher, ['PublishedPort', 'publishedPort', 'published']);
  const targetPort = getPortValue(publisher, ['TargetPort', 'targetPort', 'target']);
  const protocol = getStringValue(publisher, ['Protocol', 'protocol']);

  if (publishedPort === undefined && targetPort === undefined) {
    return undefined;
  }

  const left = publishedPort === undefined ? '' : `${url === undefined ? '' : `${url}:`}${publishedPort}`;
  const right = targetPort === undefined ? '' : targetPort;
  const mapping = left.length === 0 ? right : `${left}->${right}`;

  return protocol === undefined ? mapping : `${mapping}/${protocol}`;
}

function inferHealthFromText(value: string): string | undefined {
  const normalizedValue = value.toLowerCase();

  if (normalizedValue.includes('unhealthy')) {
    return 'unhealthy';
  }

  if (normalizedValue.includes('healthy')) {
    return 'healthy';
  }

  return undefined;
}

function getStringValue(row: ComposePsRow, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function getUnknownValue(row: ComposePsRow, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.hasOwn(row, key)) {
      return row[key];
    }
  }

  return undefined;
}

function getPortValue(row: ComposePsRow, keys: string[]): string | undefined {
  const value = getUnknownValue(row, keys);

  if (typeof value === 'number') {
    return value.toString();
  }

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function addValueOption(args: string[], flag: string, value: string | undefined): void {
  if (value !== undefined && value.length > 0) {
    args.push(flag, value);
  }
}

function addRepeatableOption(args: string[], flag: string, values: string[] | undefined): void {
  for (const value of values ?? []) {
    args.push(flag, value);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
