import { checkbox, confirm, input, select } from '@inquirer/prompts';
import type { PromptAdapter, PromptChoice } from '../guided/guided-command-resolver.js';

export const inquirerPromptAdapter: PromptAdapter = {
  async confirm(question: { message: string; defaultValue?: boolean }): Promise<boolean> {
    return confirm({
      message: question.message,
      ...(question.defaultValue === undefined ? {} : { default: question.defaultValue }),
    });
  },

  async input(question: { message: string; defaultValue?: string }): Promise<string> {
    return input({
      message: question.message,
      ...(question.defaultValue === undefined ? {} : { default: question.defaultValue }),
    });
  },

  async checkbox(question: { message: string; choices: PromptChoice[] }): Promise<string[]> {
    return checkbox<string>({
      message: question.message,
      choices: question.choices,
    });
  },

  async select(question: { message: string; choices: PromptChoice[] }): Promise<string> {
    return select<string>({
      message: question.message,
      choices: question.choices,
    });
  },
};
