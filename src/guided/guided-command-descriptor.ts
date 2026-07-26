import type { ComposeSubCommand } from '../compose/compose-command.js';
import type { ComposeCommandOptions } from '../compose/compose-options.js';

export type GuidedOptionValue = boolean | string | string[];

export type GuidedOptionValueType = 'boolean' | 'string' | 'string[]';

export type GuidedOptionPromptKind = 'confirm' | 'input';

export type GuidedOptionDescriptor = {
  key: keyof ComposeCommandOptions;
  flag: string;
  description: string;
  valueType: GuidedOptionValueType;
  promptKind: GuidedOptionPromptKind;
  message: string;
  defaultValue?: GuidedOptionValue;
  safeDefault?: GuidedOptionValue;
  destructive?: boolean;
  emptyInputMeansUnset?: boolean;
};

export type GuidedServiceSelectionDescriptor = {
  required: boolean;
  multiple: boolean;
  message: string;
  emptySelectionMeansAll?: boolean;
};

export type GuidedPassthroughDescriptor = {
  required: boolean;
  message: string;
  defaultValue?: string;
};

export type GuidedCommandDescriptor = {
  command: ComposeSubCommand;
  options: GuidedOptionDescriptor[];
  serviceSelection?: GuidedServiceSelectionDescriptor;
  passthrough?: GuidedPassthroughDescriptor;
};
