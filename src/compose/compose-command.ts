import type { ComposeCommandOptions } from './compose-options.js';

export type ComposeSubCommand =
  | 'up'
  | 'down'
  | 'ps'
  | 'logs'
  | 'build'
  | 'pull'
  | 'restart'
  | 'exec'
  | 'run'
  | 'stop'
  | 'start'
  | 'create'
  | 'pause'
  | 'unpause'
  | 'kill'
  | 'rm'
  | 'config'
  | 'cp'
  | 'events'
  | 'images'
  | 'ls'
  | 'port'
  | 'top'
  | 'version'
  | 'watch';

export type ComposeExecutionRequest = {
  composeFilePath: string;
  workingDirectory?: string;
  command: ComposeSubCommand;
  services: string[];
  options: ComposeCommandOptions;
  passthroughArgs: string[];
};

export type BuiltComposeCommand = {
  binary: 'docker';
  args: string[];
  cwd: string;
  displayCommand: string;
};
