import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { select } from '@inquirer/prompts';
import { Command } from 'commander';
import {
  addComposeProjectService,
  createComposeProjectApplication,
  executeComposeApplicationCommand,
  exportConfig,
  getConfigPath,
  importConfigFile,
  removeComposeProjectService,
  resetConfig,
  scanComposeProjects,
  updateComposeProjectService,
  validateComposeProject,
} from '../app/index.js';
import type { ComposeApplicationCommandOptions, ComposeProjectServiceInput, UpdateComposeProjectServiceInput } from '../app/index.js';
import type { ComposeSubCommand } from '../compose/compose-command.js';
import { inquirerPromptAdapter } from './inquirer-prompt-adapter.js';
import { resolvePackageVersion } from './package-metadata.js';

export function createComposeCliProgram(): Command {
  const program = new Command();

  program
    .name('compose')
    .description('Discover, manage and execute Docker Compose projects.')
    .version(resolvePackageVersion());

  registerScanCommand(program);
  registerSelectCommand(program);
  registerComposeExecutionCommands(program);
  registerProjectCommands(program);

  return program;
}

function registerScanCommand(program: Command): void {
  program
    .command('scan')
    .argument('[root]', 'root directory to scan', '.')
    .option('--json', 'output JSON')
    .option('--max-depth <depth>', 'maximum recursive depth', parseInteger)
    .action(async (root: string, options: { json?: boolean; maxDepth?: number }) => {
      const projects = await scanComposeProjects({ root, ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }) });

      if (options.json === true) {
        console.log(JSON.stringify(projects, null, 2));
        return;
      }

      if (projects.length === 0) {
        console.log('No Docker Compose projects found.');
        return;
      }

      for (const project of projects) {
        const services = project.services.length === 0 ? 'no services detected' : project.services.join(', ');
        console.log(`${project.composeFilePath} (${services})`);

        for (const warning of project.warnings) {
          console.warn(`  warning: ${warning}`);
        }
      }
    });
}

function registerSelectCommand(program: Command): void {
  program
    .command('select')
    .argument('[root]', 'root directory to scan', '.')
    .action(async (root: string) => {
      const projects = await scanComposeProjects({ root });

      if (projects.length === 0) {
        console.log('No Docker Compose projects found.');
        return;
      }

      const composeFilePath = await select({
        message: 'Select a Compose project',
        choices: projects.map((project) => ({
          name: `${project.relativePath} (${project.services.join(', ') || 'no services detected'})`,
          value: project.composeFilePath,
        })),
      });

      const action = await select<ComposeSubCommand>({
        message: 'Select an action',
        choices: [
          { name: 'ps', value: 'ps' },
          { name: 'up -d', value: 'up' },
          { name: 'logs --follow', value: 'logs' },
          { name: 'down', value: 'down' },
        ],
      });

      await executeAndPrint({
        command: action,
        composeFilePath,
        services: [],
        passthroughArgs: [],
        options: {
          detach: action === 'up',
          follow: action === 'logs',
        },
      });
    });
}

function registerComposeExecutionCommands(program: Command): void {
  addComposeCommand(program, 'up')
    .argument('[services...]')
    .option('-d, --detach', 'run containers in the background')
    .option('--remove-orphans', 'remove containers for services not defined in the Compose file')
    .option('--build', 'build images before starting containers')
    .option('--scale <scale...>', 'scale service using service=count')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('up', services, options));

  addComposeCommand(program, 'down')
    .option('--remove-orphans', 'remove containers for services not defined in the Compose file')
    .option('--volumes', 'remove named volumes declared in the volumes section')
    .action(async (options: ComposeCliOptions) => runSimpleComposeCommand('down', [], options));

  addComposeCommand(program, 'ps')
    .argument('[services...]')
    .option('--all', 'show all containers')
    .option('--quiet', 'only display IDs')
    .option('--format <format>', 'format output')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('ps', services, options));

  addComposeCommand(program, 'logs')
    .argument('[services...]')
    .option('-f, --follow', 'follow log output')
    .option('--tail <lines>', 'number of lines to show from the end of the logs')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('logs', services, options));

  addComposeCommand(program, 'build')
    .argument('[services...]')
    .option('--no-cache', 'do not use cache when building the image')
    .option('--pull', 'always attempt to pull a newer version of the image')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('build', services, options));

  addComposeCommand(program, 'pull')
    .argument('[services...]')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('pull', services, options));

  addComposeCommand(program, 'restart')
    .argument('[services...]')
    .option('-t, --timeout <seconds>', 'shutdown timeout in seconds')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('restart', services, options));

  addComposeCommand(program, 'start')
    .argument('[services...]')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('start', services, options));

  addComposeCommand(program, 'stop')
    .argument('[services...]')
    .option('-t, --timeout <seconds>', 'shutdown timeout in seconds')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('stop', services, options));

  addComposeCommand(program, 'create')
    .argument('[services...]')
    .option('--build', 'build images before creating containers')
    .option('--no-build', 'do not build images before creating containers')
    .option('--remove-orphans', 'remove containers for services not defined in the Compose file')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('create', services, options));

  addComposeCommand(program, 'pause')
    .argument('[services...]')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('pause', services, options));

  addComposeCommand(program, 'unpause')
    .argument('[services...]')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('unpause', services, options));

  addComposeCommand(program, 'kill')
    .argument('[services...]')
    .option('-s, --signal <signal>', 'signal to send to containers')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('kill', services, options));

  addComposeCommand(program, 'rm')
    .argument('[services...]')
    .option('-f, --force', 'do not ask for confirmation')
    .option('-s, --stop', 'stop containers before removing')
    .option('-v, --volumes', 'remove anonymous volumes attached to containers')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('rm', services, options));

  const configCommand = addComposeCommand(program, 'config')
    .option('--quiet', 'only validate the Docker Compose configuration')
    .option('--no-interpolate', 'do not interpolate environment variables')
    .option('--services', 'print service names')
    .option('--volumes', 'print volume names')
    .option('--profiles', 'print profile names')
    .option('--format <format>', 'output format')
    .action(async (options: ComposeCliOptions) => runSimpleComposeCommand('config', [], createConfigComposeCliOptions(options)));

  registerLocalConfigCommands(configCommand);

  addComposeCommand(program, 'cp')
    .argument('<source>', 'source path')
    .argument('<target>', 'target path')
    .action(async (source: string, target: string, options: ComposeCliOptions) => runSimpleComposeCommand('cp', [], options, [source, target]));

  addComposeCommand(program, 'events')
    .argument('[services...]')
    .option('--json', 'output events as JSON')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('events', services, options));

  addComposeCommand(program, 'images')
    .argument('[services...]')
    .option('-q, --quiet', 'only display image IDs')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('images', services, options));

  addComposeCommand(program, 'ls')
    .option('--all', 'show stopped Compose projects')
    .option('--quiet', 'only display IDs')
    .option('--format <format>', 'output format')
    .action(async (options: ComposeCliOptions) => runSimpleComposeCommand('ls', [], options));

  addComposeCommand(program, 'port')
    .argument('<service>', 'service name')
    .argument('<private-port>', 'private container port')
    .action(async (service: string, privatePort: string, options: ComposeCliOptions) => runSimpleComposeCommand('port', [service], options, [privatePort]));

  addComposeCommand(program, 'top')
    .argument('[services...]')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('top', services, options));

  addComposeCommand(program, 'version')
    .option('--short', 'only show the version number')
    .action(async (options: ComposeCliOptions) => runSimpleComposeCommand('version', [], options));

  addComposeCommand(program, 'watch')
    .argument('[services...]')
    .option('--no-up', 'do not build and start services before watching')
    .action(async (services: string[], options: ComposeCliOptions) => runSimpleComposeCommand('watch', services, options));

  addComposeCommand(program, 'exec')
    .argument('[service]')
    .argument('[command...]')
    .option('-e, --env <env...>', 'set environment variables')
    .option('-u, --user <user>', 'run as specified user')
    .option('-w, --workdir <path>', 'working directory inside the container')
    .action(async (service: string | undefined, commandArgs: string[], options: ComposeCliOptions) =>
      runSimpleComposeCommand('exec', service === undefined ? [] : [service], options, commandArgs),
    );

  addComposeCommand(program, 'run')
    .argument('[service]')
    .argument('[command...]')
    .option('--rm', 'remove container after run')
    .option('-e, --env <env...>', 'set environment variables')
    .action(async (service: string | undefined, commandArgs: string[], options: ComposeCliOptions) =>
      runSimpleComposeCommand('run', service === undefined ? [] : [service], options, commandArgs),
    );
}

function registerLocalConfigCommands(configCommand: Command): void {
  configCommand
    .command('path')
    .description('Print the local compose user config path.')
    .option('--json', 'print the config path as JSON')
    .action((options: ConfigPathCliOptions) => {
      const result = getConfigPath();

      if (options.json === true) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(result.path);
    });

  configCommand
    .command('export')
    .description('Export the local compose user config as JSON.')
    .option('--output <file>', 'write exported JSON to a file instead of stdout')
    .action(async (options: ConfigExportCliOptions) => {
      const result = await exportConfig();

      if (options.output !== undefined) {
        const outputPath = resolve(options.output);
        await writeFile(outputPath, result.content, 'utf-8');
        console.log(`Config exported to ${outputPath}`);
        return;
      }

      console.log(result.content.trimEnd());
    });

  configCommand
    .command('import')
    .description('Import and validate a compose user config backup.')
    .argument('<file>', 'JSON config file to import')
    .option('--yes', 'overwrite the current config without asking for confirmation')
    .action(async (filePath: string, options: ConfigImportCliOptions) => {
      if (options.yes !== true) {
        const shouldImport = await inquirerPromptAdapter.confirm({
          message: 'Importing config will replace the current workspaces, favorites and recents. Continue?',
          defaultValue: false,
        });

        if (!shouldImport) {
          console.log('Config import cancelled.');
          return;
        }
      }

      const result = await importConfigFile({ filePath });
      console.log(`Config imported from ${result.importedFrom}`);
      console.log(`Target: ${result.path}`);
      console.log(`Workspaces: ${result.workspaceCount}, favorites: ${result.favoriteCount}, recents: ${result.recentCount}`);
    });

  configCommand
    .command('reset')
    .description('Reset the local compose user config to an empty configuration.')
    .option('--yes', 'reset the current config without asking for confirmation')
    .action(async (options: ConfigResetCliOptions) => {
      if (options.yes !== true) {
        const shouldReset = await inquirerPromptAdapter.confirm({
          message: 'Resetting config will remove all workspaces, favorites and recents. Continue?',
          defaultValue: false,
        });

        if (!shouldReset) {
          console.log('Config reset cancelled.');
          return;
        }
      }

      const result = await resetConfig();
      console.log(`Config reset: ${result.path}`);
    });
}

function registerProjectCommands(program: Command): void {
  const project = program.command('project').description('Create and maintain Compose projects.');

  project
    .command('init')
    .argument('<directory>', 'project directory')
    .option('--name <name>', 'Compose project name')
    .option('--overwrite', 'overwrite an existing compose.yaml')
    .action(async (directory: string, options: { name?: string; overwrite?: boolean }) => {
      const created = await createComposeProjectApplication({
        directory,
        ...(options.name === undefined ? {} : { name: options.name }),
        ...(options.overwrite === undefined ? {} : { overwrite: options.overwrite }),
      });
      console.log(`Created ${created.composeFilePath}`);
    });

  project
    .command('add-service')
    .argument('<service>', 'service name')
    .requiredOption('--project <path>', 'project directory or Compose file')
    .option('--image <image>', 'service image')
    .option('--build <path>', 'build context')
    .option('--port <port...>', 'port mappings')
    .option('--volume <volume...>', 'volume mappings')
    .option('--env <env...>', 'environment variables as key=value')
    .option('--depends-on <service...>', 'dependencies')
    .option('--overwrite', 'overwrite an existing service')
    .action(async (service: string, options: ProjectServiceCliOptions) => {
      const updated = await addComposeProjectService(createComposeProjectServiceInput(service, options));
      console.log(`Updated ${updated.composeFilePath}`);
    });

  project
    .command('remove-service')
    .argument('<service>', 'service name')
    .requiredOption('--project <path>', 'project directory or Compose file')
    .action(async (service: string, options: { project: string }) => {
      const updated = await removeComposeProjectService({ projectPath: options.project, service });
      console.log(`Updated ${updated.composeFilePath}`);
    });

  project
    .command('update-service')
    .argument('<service>', 'service name')
    .requiredOption('--project <path>', 'project directory or Compose file')
    .option('--image <image>', 'service image')
    .option('--build <path>', 'build context')
    .action(async (service: string, options: ProjectServiceCliOptions) => {
      const updated = await updateComposeProjectService(createUpdateComposeProjectServiceInput(service, options));
      console.log(`Updated ${updated.composeFilePath}`);
    });

  project
    .command('validate')
    .requiredOption('--project <path>', 'project directory or Compose file')
    .action(async (options: { project: string }) => {
      const result = await validateComposeProject({ projectPath: options.project });
      console.log(`Valid Compose file: ${result.composeFilePath}`);
    });
}

function addComposeCommand(program: Command, name: string): Command {
  return program
    .command(name)
    .option('--project <path>', 'project directory or Compose file')
    .option('--file <path>', 'explicit Compose file')
    .option('--project-name <name>', 'Docker Compose project name')
    .option('--profile <profile...>', 'Compose profile')
    .option('--guided', 'ask useful questions before executing the command')
    .option('--yes', 'accept safe guided defaults without asking questions')
    .option('--no-interactive', 'disable prompts and fail when guidance would be required')
    .option('--dry-run', 'print generated docker compose command')
    .option('--no-ansi', 'disable ANSI output from docker compose');
}

async function runSimpleComposeCommand(
  command: ComposeSubCommand,
  services: string[],
  options: ComposeCliOptions,
  passthroughArgs: string[] = [],
): Promise<void> {
  await executeAndPrint({
    command,
    services,
    passthroughArgs,
    options,
  });
}

async function executeAndPrint(request: {
  command: ComposeSubCommand;
  composeFilePath?: string;
  services: string[];
  passthroughArgs: string[];
  options: ComposeCliOptions;
}): Promise<void> {
  const result = await executeComposeApplicationCommand(
    {
      command: request.command,
      services: request.services,
      options: request.options,
      passthroughArgs: request.passthroughArgs,
      ...(request.composeFilePath === undefined ? {} : { composeFilePath: request.composeFilePath }),
    },
    { prompts: inquirerPromptAdapter },
  );

  if (result.dryRun) {
    console.log(result.command);
  }

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

function createConfigComposeCliOptions(options: ComposeCliOptions): ComposeCliOptions {
  return {
    ...options,
    ...(options.services === undefined ? {} : { servicesOnly: options.services }),
    ...(options.volumes === undefined ? {} : { volumesOnly: options.volumes }),
    ...(options.profiles === undefined ? {} : { profilesOnly: options.profiles }),
  };
}

function createComposeProjectServiceInput(service: string, options: ProjectServiceCliOptions): ComposeProjectServiceInput {
  return {
    projectPath: options.project,
    service,
    ...(options.image === undefined ? {} : { image: options.image }),
    ...(options.build === undefined ? {} : { build: options.build }),
    ...(options.port === undefined ? {} : { ports: options.port }),
    ...(options.volume === undefined ? {} : { volumes: options.volume }),
    ...(options.env === undefined ? {} : { environment: options.env }),
    ...(options.dependsOn === undefined ? {} : { dependsOn: options.dependsOn }),
    ...(options.overwrite === undefined ? {} : { overwrite: options.overwrite }),
  };
}

function createUpdateComposeProjectServiceInput(service: string, options: ProjectServiceCliOptions): UpdateComposeProjectServiceInput {
  return {
    projectPath: options.project,
    service,
    ...(options.image === undefined ? {} : { image: options.image }),
    ...(options.build === undefined ? {} : { build: options.build }),
  };
}

function parseInteger(value: string): number {
  const parsedValue = Number.parseInt(value, 10);

  if (Number.isNaN(parsedValue)) {
    throw new Error(`Invalid integer: ${value}`);
  }

  return parsedValue;
}

type ComposeCliOptions = ComposeApplicationCommandOptions & {
  services?: boolean;
  profiles?: boolean;
};

type ProjectServiceCliOptions = {
  project: string;
  image?: string;
  build?: string;
  port?: string[];
  volume?: string[];
  env?: string[];
  dependsOn?: string[];
  overwrite?: boolean;
};

type ConfigPathCliOptions = {
  json?: boolean;
};

type ConfigExportCliOptions = {
  output?: string;
};

type ConfigImportCliOptions = {
  yes?: boolean;
};

type ConfigResetCliOptions = {
  yes?: boolean;
};
