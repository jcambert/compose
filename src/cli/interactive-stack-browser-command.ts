import type { Command } from 'commander';
import { browseApplicationStacks } from '../app/stack-browser-service.js';
import type { StackBrowserOptions } from '../interactive/stack-browser.js';
import { createBrowserPromptAdapter } from './browser-prompt-adapter.js';
import type { BrowserPromptSortMode } from './browser-prompt-adapter.js';
import { inquirerPromptAdapter } from './inquirer-prompt-adapter.js';

export function registerInteractiveStackBrowserCommand(program: Command): void {
  program
    .command('browse')
    .alias('stacks')
    .description('Scan and browse Compose stacks, services and actions interactively.')
    .argument('[root]', 'root directory to scan')
    .option('--max-depth <depth>', 'maximum recursive scan depth', parseInteger)
    .option('--project-name <name>', 'Docker Compose project name')
    .option('--profile <profile...>', 'Compose profile')
    .option('--dry-run', 'print generated docker compose commands without executing them')
    .option('--no-ansi', 'disable ANSI output from docker compose')
    .option('--filter <text>', 'filter the initial stack selection by name, path, service or runtime text')
    .option('--sort <mode>', 'sort the initial stack selection by name, path, services or runtime', parseBrowserPromptSortMode)
    .action(async (root: string | undefined, options: StackBrowserCliOptions) => {
      const result = await browseApplicationStacks(
        {
          ...(root === undefined ? {} : { root }),
          options: createStackBrowserOptions(options),
        },
        {
          prompts: createBrowserPromptAdapter(inquirerPromptAdapter, {
            ...(options.filter === undefined ? {} : { filter: options.filter }),
            ...(options.sort === undefined ? {} : { sort: options.sort }),
          }),
          warn: console.warn,
        },
      );

      if (result.lastExitCode !== undefined && result.lastExitCode !== 0) {
        process.exitCode = result.lastExitCode;
      }
    });
}

function createStackBrowserOptions(options: StackBrowserCliOptions): StackBrowserOptions {
  return {
    ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
    ...(options.projectName === undefined ? {} : { projectName: options.projectName }),
    ...(options.profile === undefined ? {} : { profile: options.profile }),
    ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
    ...(options.noAnsi === undefined ? {} : { noAnsi: options.noAnsi }),
  };
}

function parseInteger(value: string): number {
  const parsedValue = Number.parseInt(value, 10);

  if (Number.isNaN(parsedValue)) {
    throw new Error(`Invalid integer: ${value}`);
  }

  return parsedValue;
}

function parseBrowserPromptSortMode(value: string): BrowserPromptSortMode {
  if (value === 'name' || value === 'path' || value === 'services' || value === 'runtime') {
    return value;
  }

  throw new Error(`Invalid browser sort mode: ${value}. Expected name, path, services or runtime.`);
}

type StackBrowserCliOptions = {
  maxDepth?: number;
  projectName?: string;
  profile?: string[];
  dryRun?: boolean;
  noAnsi?: boolean;
  filter?: string;
  sort?: BrowserPromptSortMode;
};
