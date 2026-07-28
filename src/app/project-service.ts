import { createComposeProject } from '../project/project-factory.js';
import type { CreateComposeProjectOptions } from '../project/project-factory.js';
import { loadComposeProject, saveComposeProject } from '../project/project-store.js';
import { addService, removeService, updateService } from '../project/service-mutator.js';
import type { AddServiceOptions } from '../project/service-mutator.js';
import { parseComposeDocument } from '../yaml/compose-parser.js';
import type { ComposeService } from '../yaml/schemas/service-schema.js';
import { resolveComposeFilePath } from './compose-file-resolver.js';

export type CreateComposeProjectInput = {
  directory: string;
  name?: string;
  overwrite?: boolean;
};

export type ComposeProjectServiceInput = {
  projectPath: string;
  service: string;
  image?: string;
  build?: string;
  ports?: string[];
  volumes?: string[];
  environment?: Record<string, string> | string[];
  dependsOn?: string[];
  overwrite?: boolean;
};

export type UpdateComposeProjectServiceInput = Pick<ComposeProjectServiceInput, 'projectPath' | 'service' | 'image' | 'build'>;

export type ValidateComposeProjectInput = {
  projectPath: string;
};

export type ComposeProjectApplicationResult = {
  composeFilePath: string;
};

export async function createComposeProjectApplication(input: CreateComposeProjectInput): Promise<ComposeProjectApplicationResult> {
  const project = await createComposeProject(input.directory, createComposeProjectOptions(input));
  return { composeFilePath: project.composeFilePath };
}

export async function addComposeProjectService(input: ComposeProjectServiceInput): Promise<ComposeProjectApplicationResult> {
  const composeFilePath = await resolveComposeFilePath(input.projectPath);
  const project = await loadComposeProject(composeFilePath);
  project.document = addService(
    project.document,
    input.service,
    createComposeService(input),
    createAddServiceOptions(input.overwrite),
  );
  await saveComposeProject(project);

  return { composeFilePath: project.composeFilePath };
}

export async function removeComposeProjectService(input: Pick<ComposeProjectServiceInput, 'projectPath' | 'service'>): Promise<ComposeProjectApplicationResult> {
  const composeFilePath = await resolveComposeFilePath(input.projectPath);
  const project = await loadComposeProject(composeFilePath);
  project.document = removeService(project.document, input.service);
  await saveComposeProject(project);

  return { composeFilePath: project.composeFilePath };
}

export async function updateComposeProjectService(input: UpdateComposeProjectServiceInput): Promise<ComposeProjectApplicationResult> {
  const composeFilePath = await resolveComposeFilePath(input.projectPath);
  const project = await loadComposeProject(composeFilePath);
  project.document = updateService(project.document, input.service, createComposeServicePatch(input));
  await saveComposeProject(project);

  return { composeFilePath: project.composeFilePath };
}

export async function validateComposeProject(input: ValidateComposeProjectInput): Promise<ComposeProjectApplicationResult> {
  const composeFilePath = await resolveComposeFilePath(input.projectPath);
  await parseComposeDocument(composeFilePath);
  return { composeFilePath };
}

export function toEnvironmentRecord(entries: string[]): Record<string, string> {
  return Object.fromEntries(
    entries.map((entry) => {
      const separatorIndex = entry.indexOf('=');

      if (separatorIndex < 1) {
        throw new Error(`Invalid environment entry: ${entry}`);
      }

      return [entry.slice(0, separatorIndex), entry.slice(separatorIndex + 1)];
    }),
  );
}

function createComposeProjectOptions(input: CreateComposeProjectInput): CreateComposeProjectOptions {
  return {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.overwrite === undefined ? {} : { overwrite: input.overwrite }),
  };
}

function createComposeService(input: ComposeProjectServiceInput): ComposeService {
  const environment = Array.isArray(input.environment) ? toEnvironmentRecord(input.environment) : input.environment;

  return {
    ...(input.image === undefined ? {} : { image: input.image }),
    ...(input.build === undefined ? {} : { build: input.build }),
    ...(input.ports === undefined ? {} : { ports: input.ports }),
    ...(input.volumes === undefined ? {} : { volumes: input.volumes }),
    ...(environment === undefined ? {} : { environment }),
    ...(input.dependsOn === undefined ? {} : { depends_on: input.dependsOn }),
  };
}

function createComposeServicePatch(input: UpdateComposeProjectServiceInput): Partial<ComposeService> {
  return {
    ...(input.image === undefined ? {} : { image: input.image }),
    ...(input.build === undefined ? {} : { build: input.build }),
  };
}

function createAddServiceOptions(overwrite: boolean | undefined): AddServiceOptions {
  return overwrite === undefined ? {} : { overwrite };
}
