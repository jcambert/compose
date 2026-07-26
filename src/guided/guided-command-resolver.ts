import type { ComposeSubCommand } from '../compose/compose-command.js';
import type { ComposeCommandOptions } from '../compose/compose-options.js';
import { ComposeError } from '../utils/errors.js';
import { getGuidedCommandDescriptor } from './compose-command-descriptors.js';
import type { GuidedCommandDescriptor, GuidedOptionDescriptor, GuidedOptionValue } from './guided-command-descriptor.js';

export type PromptChoice = {
  name: string;
  value: string;
};

export type PromptAdapter = {
  confirm(question: { message: string; defaultValue?: boolean }): Promise<boolean>;
  input(question: { message: string; defaultValue?: string }): Promise<string>;
  checkbox(question: { message: string; choices: PromptChoice[] }): Promise<string[]>;
  select(question: { message: string; choices: PromptChoice[] }): Promise<string>;
};

export type GuidedCommandResolutionRequest = {
  command: ComposeSubCommand;
  options: ComposeCommandOptions;
  services: string[];
  passthroughArgs: string[];
  availableServices: string[];
};

export type GuidedCommandResolutionResult = {
  options: ComposeCommandOptions;
  services: string[];
  passthroughArgs: string[];
};

export async function resolveGuidedCommand(
  request: GuidedCommandResolutionRequest,
  prompts: PromptAdapter,
): Promise<GuidedCommandResolutionResult> {
  if (request.options.guided !== true) {
    return {
      options: request.options,
      services: request.services,
      passthroughArgs: request.passthroughArgs,
    };
  }

  if (request.options.interactive === false) {
    throw new ComposeError('Guided mode cannot run when --no-interactive is set.');
  }

  const descriptor = getGuidedCommandDescriptor(request.command);
  const options: ComposeCommandOptions = { ...request.options };
  let services = [...request.services];
  let passthroughArgs = [...request.passthroughArgs];

  if (request.options.yes === true) {
    applySafeDefaults(options, descriptor);
    return { options, services, passthroughArgs };
  }

  services = await resolveServices(request, descriptor, prompts);
  passthroughArgs = await resolvePassthroughArgs(passthroughArgs, descriptor, prompts);

  for (const option of descriptor.options) {
    if (hasResolvedOption(options, option.key)) {
      continue;
    }

    const value = await askOption(option, prompts);

    if (value !== undefined) {
      setOptionValue(options, option.key, value);
    }
  }

  return { options, services, passthroughArgs };
}

async function resolveServices(
  request: GuidedCommandResolutionRequest,
  descriptor: GuidedCommandDescriptor,
  prompts: PromptAdapter,
): Promise<string[]> {
  const serviceSelection = descriptor.serviceSelection;

  if (serviceSelection === undefined || request.services.length > 0) {
    return request.services;
  }

  if (request.availableServices.length === 0) {
    if (!serviceSelection.required) {
      return [];
    }

    const answer = await prompts.input({ message: serviceSelection.message });
    const serviceName = answer.trim();

    if (serviceName.length === 0) {
      throw new ComposeError('A service name is required for this guided command.');
    }

    return [serviceName];
  }

  const choices = request.availableServices.map((service) => ({ name: service, value: service }));

  if (serviceSelection.multiple) {
    const selectedServices = await prompts.checkbox({
      message: serviceSelection.message,
      choices,
    });

    if (selectedServices.length === 0 && serviceSelection.emptySelectionMeansAll === true) {
      return [];
    }

    return selectedServices;
  }

  return [
    await prompts.select({
      message: serviceSelection.message,
      choices,
    }),
  ];
}

async function resolvePassthroughArgs(
  currentPassthroughArgs: string[],
  descriptor: GuidedCommandDescriptor,
  prompts: PromptAdapter,
): Promise<string[]> {
  if (descriptor.passthrough === undefined || currentPassthroughArgs.length > 0) {
    return currentPassthroughArgs;
  }

  const answer = await prompts.input({
    message: descriptor.passthrough.message,
    ...(descriptor.passthrough.defaultValue === undefined ? {} : { defaultValue: descriptor.passthrough.defaultValue }),
  });

  const commandText = answer.trim();

  if (commandText.length === 0) {
    if (descriptor.passthrough.required) {
      throw new ComposeError('A command is required for this guided Compose operation.');
    }

    return [];
  }

  return splitCommandLine(commandText);
}

async function askOption(
  option: GuidedOptionDescriptor,
  prompts: PromptAdapter,
): Promise<GuidedOptionValue | undefined> {
  if (option.promptKind === 'confirm') {
    return prompts.confirm({
      message: option.message,
      ...(typeof option.defaultValue === 'boolean' ? { defaultValue: option.defaultValue } : {}),
    });
  }

  const answer = await prompts.input({
    message: option.message,
    ...(typeof option.defaultValue === 'string' ? { defaultValue: option.defaultValue } : {}),
  });
  const trimmedAnswer = answer.trim();

  if (trimmedAnswer.length === 0 && option.emptyInputMeansUnset === true) {
    return undefined;
  }

  if (option.valueType === 'string[]') {
    return splitCommaSeparatedValues(trimmedAnswer);
  }

  return trimmedAnswer;
}

function applySafeDefaults(options: ComposeCommandOptions, descriptor: GuidedCommandDescriptor): void {
  for (const option of descriptor.options) {
    if (option.safeDefault !== undefined && !hasResolvedOption(options, option.key)) {
      setOptionValue(options, option.key, option.safeDefault);
    }
  }
}

function hasResolvedOption(options: ComposeCommandOptions, key: keyof ComposeCommandOptions): boolean {
  return (options as Record<string, unknown>)[key] !== undefined;
}

function setOptionValue(options: ComposeCommandOptions, key: keyof ComposeCommandOptions, value: GuidedOptionValue): void {
  (options as Record<string, unknown>)[key] = value;
}

function splitCommaSeparatedValues(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function splitCommandLine(value: string): string[] {
  return value.split(/\s+/).filter((part) => part.length > 0);
}
