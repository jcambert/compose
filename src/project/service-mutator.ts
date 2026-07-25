import { ComposeProjectError } from '../utils/errors.js';
import type { ComposeDocument } from '../yaml/schemas/compose-schema.js';
import type { ComposeService } from '../yaml/schemas/service-schema.js';

const serviceNamePattern = /^[a-zA-Z0-9._-]+$/;

export type AddServiceOptions = {
  overwrite?: boolean;
};

export function addService(
  document: ComposeDocument,
  serviceName: string,
  service: ComposeService,
  options: AddServiceOptions = {},
): ComposeDocument {
  assertServiceName(serviceName);
  const services = { ...document.services };

  if (!options.overwrite && services[serviceName] !== undefined) {
    throw new ComposeProjectError(`Service already exists: ${serviceName}`);
  }

  services[serviceName] = service;

  return {
    ...document,
    services,
  };
}

export function removeService(document: ComposeDocument, serviceName: string): ComposeDocument {
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

export function updateService(
  document: ComposeDocument,
  serviceName: string,
  patch: Partial<ComposeService>,
): ComposeDocument {
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
        ...patch,
      },
    },
  };
}

function assertServiceName(serviceName: string): void {
  if (!serviceNamePattern.test(serviceName)) {
    throw new ComposeProjectError(`Invalid service name: ${serviceName}`);
  }
}
