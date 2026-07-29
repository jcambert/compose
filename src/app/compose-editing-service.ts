import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { ComposeProjectError } from '../utils/errors.js';
import { parseComposeDocumentContent } from '../yaml/compose-parser.js';
import {
  createComposeServiceMutationPreview,
  listEditableComposeServices,
  type ComposeServiceForm,
  type ComposeServiceMutationPreview,
  type ComposeServicePatch,
} from '../yaml/compose-service-editor.js';
import type { EditableComposeService } from '../yaml/compose-service-editor.js';
import { resolveComposeFilePath } from './compose-file-resolver.js';

export type ComposeEditingTargetInput = {
  projectPath?: string;
  composeFilePath?: string;
};

export type ComposeServiceListResult = {
  composeFilePath: string;
  contentHash: string;
  services: EditableComposeService[];
};

export type PreviewCreateComposeServiceInput = ComposeEditingTargetInput & {
  service: ComposeServiceForm;
  overwrite?: boolean;
};

export type PreviewUpdateComposeServiceInput = ComposeEditingTargetInput & {
  serviceName: string;
  patch: ComposeServicePatch;
};

export type PreviewDeleteComposeServiceInput = ComposeEditingTargetInput & {
  serviceName: string;
};

export type CommitComposeServiceMutationInput = {
  preview: ComposeServiceMutationPreview;
};

export type ComposeServiceMutationCommitResult = {
  composeFilePath: string;
  operation: ComposeServiceMutationPreview['operation'];
  serviceName: string;
  contentHash: string;
};

export async function listComposeServices(input: ComposeEditingTargetInput): Promise<ComposeServiceListResult> {
  const target = await readComposeEditingTarget(input);

  return {
    composeFilePath: target.composeFilePath,
    contentHash: target.contentHash,
    services: listEditableComposeServices(target.document),
  };
}

export async function previewCreateComposeService(input: PreviewCreateComposeServiceInput): Promise<ComposeServiceMutationPreview> {
  const target = await readComposeEditingTarget(input);

  return createComposeServiceMutationPreview({
    composeFilePath: target.composeFilePath,
    originalContent: target.content,
    originalContentHash: target.contentHash,
    document: target.document,
    mutation: {
      operation: 'create',
      service: input.service,
      ...(input.overwrite === undefined ? {} : { overwrite: input.overwrite }),
    },
  });
}

export async function previewUpdateComposeService(input: PreviewUpdateComposeServiceInput): Promise<ComposeServiceMutationPreview> {
  const target = await readComposeEditingTarget(input);

  return createComposeServiceMutationPreview({
    composeFilePath: target.composeFilePath,
    originalContent: target.content,
    originalContentHash: target.contentHash,
    document: target.document,
    mutation: {
      operation: 'update',
      serviceName: input.serviceName,
      patch: input.patch,
    },
  });
}

export async function previewDeleteComposeService(input: PreviewDeleteComposeServiceInput): Promise<ComposeServiceMutationPreview> {
  const target = await readComposeEditingTarget(input);

  return createComposeServiceMutationPreview({
    composeFilePath: target.composeFilePath,
    originalContent: target.content,
    originalContentHash: target.contentHash,
    document: target.document,
    mutation: {
      operation: 'delete',
      serviceName: input.serviceName,
    },
  });
}

export async function commitComposeServiceMutation(input: CommitComposeServiceMutationInput): Promise<ComposeServiceMutationCommitResult> {
  const currentContent = await readFile(input.preview.composeFilePath, 'utf8');
  const currentHash = hashContent(currentContent);

  if (currentHash !== input.preview.originalContentHash) {
    throw new ComposeProjectError(`Compose file changed since preview was generated: ${input.preview.composeFilePath}`);
  }

  parseComposeDocumentContent(input.preview.nextContent, input.preview.composeFilePath);
  await writeFile(input.preview.composeFilePath, input.preview.nextContent, 'utf8');

  return {
    composeFilePath: input.preview.composeFilePath,
    operation: input.preview.operation,
    serviceName: input.preview.serviceName,
    contentHash: hashContent(input.preview.nextContent),
  };
}

type ComposeEditingTarget = {
  composeFilePath: string;
  content: string;
  contentHash: string;
  document: ReturnType<typeof parseComposeDocumentContent>;
};

async function readComposeEditingTarget(input: ComposeEditingTargetInput): Promise<ComposeEditingTarget> {
  const composeFilePath = await resolveComposeFilePath(input.projectPath, input.composeFilePath);
  const content = await readFile(composeFilePath, 'utf8');
  const document = parseComposeDocumentContent(content, composeFilePath);

  return {
    composeFilePath,
    content,
    contentHash: hashContent(content),
    document,
  };
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
