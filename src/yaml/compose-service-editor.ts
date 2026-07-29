import { stringify } from 'yaml';
import { ComposeProjectError, ComposeYamlError } from '../utils/errors.js';
import { stringifyComposeDocument } from './compose-writer.js';
import { validateComposeDocument } from './compose-validator.js';
import type { ComposeDocument } from './schemas/compose-schema.js';
import type { ComposeService } from './schemas/service-schema.js';

const serviceNamePattern = /^[a-zA-Z0-9._-]+$/;
const editableServiceKeys = new Set(['image', 'build', 'ports', 'environment', 'volumes', 'depends_on', 'command', 'restart']);
const knownReadOnlyServiceKeys = new Set(['deploy', 'labels', 'networks']);

export type ComposeEnvironmentEntry = {
  name: string;
  value: string;
};

export type ComposeServiceForm = {
  name: string;
  image?: string;
  build?: string | Record<string, unknown>;
  ports?: string[];
  environment?: ComposeEnvironmentEntry[];
  volumes?: string[];
  dependsOn?: string[];
  command?: string | string[];
  restart?: string;
};

export type ComposeServicePatch = Omit<Partial<ComposeServiceForm>, 'name'>;

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

export type ComposeServiceMutation =
  | {
      operation: 'create';
      service: ComposeServiceForm;
      overwrite?: boolean;
    }
  | {
      operation: 'update';
      serviceName: string;
      patch: ComposeServicePatch;
    }
  | {
      operation: 'delete';
      serviceName: string;
    };

export type ComposeServiceMutationValidation = {
  success: true;
  errors: [];
};

export type ComposeServiceMutationPreview = {
  operation: ComposeServiceMutation['operation'];
  composeFilePath: string;
  serviceName: string;
  originalContentHash: string;
  beforeYaml?: string;
  afterYaml?: string;
  diff: string;
  nextContent: string;
  validation: ComposeServiceMutationValidation;
  warnings: string[];
};

export type CreateComposeServiceMutationPreviewInput = {
  composeFilePath: string;
  originalContent: string;
  originalContentHash: string;
  document: ComposeDocument;
  mutation: ComposeServiceMutation;
};

export function listEditableComposeServices(document: ComposeDocument): EditableComposeService[] {
  return Object.entries(document.services)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, service]) => toEditableComposeService(name, service));
}

export function createComposeServiceMutationPreview(input: CreateComposeServiceMutationPreviewInput): ComposeServiceMutationPreview {
  const serviceName = getMutationServiceName(input.mutation);
  const beforeService = input.document.services[serviceName];
  const beforeYaml = beforeService === undefined ? undefined : stringifyServiceSnippet(serviceName, beforeService);
  const nextDocument = applyComposeServiceMutation(input.document, input.mutation);
  const afterService = nextDocument.services[serviceName];
  const afterYaml = afterService === undefined ? undefined : stringifyServiceSnippet(serviceName, afterService);
  const validation = validateComposeDocument(nextDocument);

  if (!validation.success) {
    throw new ComposeYamlError(`Compose service mutation produced an invalid Compose document: ${validation.errors.join('; ')}`);
  }

  const nextContent = stringifyComposeDocument(validation.document);

  return {
    operation: input.mutation.operation,
    composeFilePath: input.composeFilePath,
    serviceName,
    originalContentHash: input.originalContentHash,
    ...(beforeYaml === undefined ? {} : { beforeYaml }),
    ...(afterYaml === undefined ? {} : { afterYaml }),
    diff: createUnifiedDiff(input.originalContent, nextContent, input.composeFilePath, input.composeFilePath),
    nextContent,
    validation: {
      success: true,
      errors: [],
    },
    warnings: createMutationWarnings(beforeService, afterService),
  };
}

export function applyComposeServiceMutation(document: ComposeDocument, mutation: ComposeServiceMutation): ComposeDocument {
  switch (mutation.operation) {
    case 'create':
      return createService(document, mutation.service, mutation.overwrite ?? false);
    case 'update':
      return updateService(document, mutation.serviceName, mutation.patch);
    case 'delete':
      return deleteService(document, mutation.serviceName);
  }
}

export function createUnifiedDiff(before: string, after: string, beforeName = 'before', afterName = 'after'): string {
  if (before === after) {
    return '';
  }

  return [
    `--- ${beforeName}`,
    `+++ ${afterName}`,
    '@@',
    ...splitDiffLines(before).map((line) => `-${line}`),
    ...splitDiffLines(after).map((line) => `+${line}`),
  ].join('\n').concat('\n');
}

function toEditableComposeService(name: string, service: ComposeService): EditableComposeService {
  const serviceRecord: Record<string, unknown> = service;
  const readOnlyKeys = Object.keys(serviceRecord)
    .filter((key) => knownReadOnlyServiceKeys.has(key))
    .sort();
  const preservedKeys = Object.keys(serviceRecord)
    .filter((key) => !editableServiceKeys.has(key) && !knownReadOnlyServiceKeys.has(key))
    .sort();

  return {
    name,
    ...(service.image === undefined ? {} : { image: service.image }),
    ...(service.build === undefined ? {} : { build: service.build }),
    ports: normalizeStringList(service.ports),
    environment: normalizeEnvironment(service.environment),
    volumes: normalizeStringList(service.volumes),
    dependsOn: normalizeDependsOn(service.depends_on),
    ...(service.command === undefined ? {} : { command: service.command }),
    ...(service.restart === undefined ? {} : { restart: service.restart }),
    readOnlyKeys,
    preservedKeys,
  };
}

function createService(document: ComposeDocument, form: ComposeServiceForm, overwrite: boolean): ComposeDocument {
  assertServiceName(form.name);

  if (!overwrite && document.services[form.name] !== undefined) {
    throw new ComposeProjectError(`Service already exists: ${form.name}`);
  }

  return {
    ...document,
    services: {
      ...document.services,
      [form.name]: toComposeService(form),
    },
  };
}

function updateService(document: ComposeDocument, serviceName: string, patch: ComposeServicePatch): ComposeDocument {
  assertServiceName(serviceName);
  const currentService = document.services[serviceName];

  if (currentService === undefined) {
    throw new ComposeProjectError(`Service does not exist: ${serviceName}`);
  }

  return {
    ...document,
    services: {
      ...document.services,
      [serviceName]: {
        ...currentService,
        ...toComposeServicePatch(patch),
      },
    },
  };
}

function deleteService(document: ComposeDocument, serviceName: string): ComposeDocument {
  assertServiceName(serviceName);

  if (document.services[serviceName] === undefined) {
    throw new ComposeProjectError(`Service does not exist: ${serviceName}`);
  }

  const services = { ...document.services };
  delete services[serviceName];

  return {
    ...document,
    services,
  };
}

function toComposeService(form: ComposeServiceForm): ComposeService {
  return toComposeServicePatch(form);
}

function toComposeServicePatch(form: ComposeServicePatch): ComposeService {
  const service: ComposeService = {};

  if (form.image !== undefined && form.image.trim() !== '') {
    service.image = form.image;
  }

  if (form.build !== undefined) {
    service.build = form.build;
  }

  if (form.ports !== undefined && form.ports.length > 0) {
    service.ports = form.ports;
  }

  if (form.environment !== undefined && form.environment.length > 0) {
    service.environment = Object.fromEntries(
      form.environment.map((entry) => {
        if (entry.name.trim() === '') {
          throw new ComposeProjectError('Environment entry name cannot be empty.');
        }

        return [entry.name, entry.value];
      }),
    );
  }

  if (form.volumes !== undefined && form.volumes.length > 0) {
    service.volumes = form.volumes;
  }

  if (form.dependsOn !== undefined && form.dependsOn.length > 0) {
    service.depends_on = form.dependsOn;
  }

  if (form.command !== undefined) {
    service.command = form.command;
  }

  if (form.restart !== undefined && form.restart.trim() !== '') {
    service.restart = form.restart;
  }

  return service;
}

function normalizeStringList(value: ComposeService['ports'] | ComposeService['volumes']): string[] {
  if (value === undefined) {
    return [];
  }

  return value.map((entry) => (typeof entry === 'object' ? JSON.stringify(entry) : String(entry)));
}

function normalizeEnvironment(environment: ComposeService['environment']): ComposeEnvironmentEntry[] {
  if (environment === undefined) {
    return [];
  }

  if (Array.isArray(environment)) {
    return environment.map((entry) => {
      const separatorIndex = entry.indexOf('=');

      if (separatorIndex < 1) {
        return { name: entry, value: '' };
      }

      return {
        name: entry.slice(0, separatorIndex),
        value: entry.slice(separatorIndex + 1),
      };
    });
  }

  return Object.entries(environment).map(([name, value]) => ({
    name,
    value: value === null ? '' : String(value),
  }));
}

function normalizeDependsOn(dependsOn: ComposeService['depends_on']): string[] {
  if (dependsOn === undefined) {
    return [];
  }

  if (Array.isArray(dependsOn)) {
    return dependsOn;
  }

  return Object.keys(dependsOn);
}

function stringifyServiceSnippet(serviceName: string, service: ComposeService): string {
  return stringify({ [serviceName]: service }, { indent: 2, lineWidth: 120 }).trimEnd();
}

function createMutationWarnings(beforeService: ComposeService | undefined, afterService: ComposeService | undefined): string[] {
  const keys = new Set<string>();

  for (const service of [beforeService, afterService]) {
    if (service === undefined) {
      continue;
    }

    for (const key of Object.keys(service)) {
      if (!editableServiceKeys.has(key)) {
        keys.add(key);
      }
    }
  }

  return [...keys].sort().map((key) => `Service key preserved by the guided editor: ${key}`);
}

function getMutationServiceName(mutation: ComposeServiceMutation): string {
  switch (mutation.operation) {
    case 'create':
      return mutation.service.name;
    case 'update':
    case 'delete':
      return mutation.serviceName;
  }
}

function assertServiceName(serviceName: string): void {
  if (!serviceNamePattern.test(serviceName)) {
    throw new ComposeProjectError(`Invalid service name: ${serviceName}`);
  }
}

function splitDiffLines(value: string): string[] {
  const normalized = value.endsWith('\n') ? value.slice(0, -1) : value;
  return normalized.length === 0 ? [] : normalized.split('\n');
}
