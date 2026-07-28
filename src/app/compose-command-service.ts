import { dirname } from 'node:path';
import { buildComposeCommand } from '../compose/compose-command-builder.js';
import type { BuiltComposeCommand, ComposeExecutionRequest, ComposeSubCommand } from '../compose/compose-command.js';
import { executeComposeCommand } from '../compose/compose-executor.js';
import type { ComposeExecutionResult, ProcessRunner } from '../compose/compose-executor.js';
import type { ComposeCommandOptions } from '../compose/compose-options.js';
import { resolveGuidedCommand } from '../guided/guided-command-resolver.js';
import type { PromptAdapter } from '../guided/guided-command-resolver.js';
import { ComposeError } from '../utils/errors.js';
import { parseComposeDocument as defaultParseComposeDocument } from '../yaml/compose-parser.js';
import { resolveComposeFilePath } from './compose-file-resolver.js';

export type ComposeApplicationCommandOptions = ComposeCommandOptions & {
  project?: string;
  file?: string;
};

export type ComposeApplicationCommandInput = {
  command: ComposeSubCommand;
  services: string[];
  options: ComposeApplicationCommandOptions;
  passthroughArgs?: string[];
  composeFilePath?: string;
};

export type ComposeApplicationCommandDependencies = {
  prompts?: PromptAdapter;
  processRunner?: ProcessRunner;
  parseComposeDocument?: typeof defaultParseComposeDocument;
};

export type ComposeApplicationCommandResult = ComposeExecutionResult & {
  request: ComposeExecutionRequest;
  dryRun: boolean;
};

const nonInteractivePromptAdapter: PromptAdapter = {
  async confirm() {
    throwMissingPromptAdapter();
  },
  async input() {
    throwMissingPromptAdapter();
  },
  async checkbox() {
    throwMissingPromptAdapter();
  },
  async select() {
    throwMissingPromptAdapter();
  },
};

export async function resolveComposeApplicationCommand(
  input: ComposeApplicationCommandInput,
  dependencies: ComposeApplicationCommandDependencies = {},
): Promise<ComposeExecutionRequest> {
  const composeFilePath = input.composeFilePath ?? await resolveComposeFilePath(input.options.project, input.options.file);
  const passthroughArgs = input.passthroughArgs ?? [];
  const parser = dependencies.parseComposeDocument ?? defaultParseComposeDocument;
  const availableServices = await getAvailableServicesForGuidance(composeFilePath, input.options.guided === true, parser);
  const guided = await resolveGuidedCommand(
    {
      command: input.command,
      options: input.options,
      services: input.services,
      passthroughArgs,
      availableServices,
    },
    dependencies.prompts ?? nonInteractivePromptAdapter,
  );

  return {
    composeFilePath,
    workingDirectory: dirname(composeFilePath),
    command: input.command,
    services: guided.services,
    passthroughArgs: guided.passthroughArgs,
    options: guided.options,
  };
}

export async function previewComposeApplicationCommand(
  input: ComposeApplicationCommandInput,
  dependencies: ComposeApplicationCommandDependencies = {},
): Promise<BuiltComposeCommand> {
  return buildComposeCommand(await resolveComposeApplicationCommand(input, dependencies));
}

export async function executeComposeApplicationCommand(
  input: ComposeApplicationCommandInput,
  dependencies: ComposeApplicationCommandDependencies = {},
): Promise<ComposeApplicationCommandResult> {
  const request = await resolveComposeApplicationCommand(input, dependencies);
  const executionResult = dependencies.processRunner === undefined
    ? await executeComposeCommand(request)
    : await executeComposeCommand(request, dependencies.processRunner);

  return {
    ...executionResult,
    request,
    dryRun: request.options.dryRun === true,
  };
}

async function getAvailableServicesForGuidance(
  composeFilePath: string,
  guided: boolean,
  parseComposeDocument: typeof defaultParseComposeDocument,
): Promise<string[]> {
  if (!guided) {
    return [];
  }

  try {
    const document = await parseComposeDocument(composeFilePath);
    return Object.keys(document.services).sort();
  } catch {
    return [];
  }
}

function throwMissingPromptAdapter(): never {
  throw new ComposeError('A prompt adapter is required to resolve an interactive guided Compose command.');
}
