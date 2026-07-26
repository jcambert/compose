import { select } from '@inquirer/prompts';
import { Command } from 'commander';
import { dirname } from 'node:path';
import { buildComposeCommand } from '../compose/compose-command-builder.js';
import { executeComposeCommand } from '../compose/compose-executor.js';
import type { ComposeSubCommand } from '../compose/compose-command.js';
import { resolveGuidedCommand } from '../guided/guided-command-resolver.js';
import { createComposeProject } from '../project/project-factory.js';
import type { CreateComposeProjectOptions } from '../project/project-factory.js';
import { loadComposeProject, saveComposeProject } from '../project/project-store.js';
import { addService, removeService, updateService } from '../project/service-mutator.js';
import type { AddServiceOptions } from '../project/service-mutator.js';
import { scanComposeFiles } from '../scanner/compose-file-scanner.js';
import type { ScanComposeFilesOptions } from '../scanner/compose-file-scanner.js';
import { parseComposeDocument } from '../yaml/compose-parser.js';
import { inquirerPromptAdapter } from './inquirer-prompt-adapter.js';
import { resolvePackageVersion } from './package-metadata.js';
import { resolveComposeFilePath } from './project-resolver.js';

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
      const projects = await scanComposeFiles(root, createScanComposeFilesOptions(options.maxDepth));

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
      const projects = await scanComposeFiles(root);

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

  addComposeCommand(program, 'config')
    .option('--quiet', 'only validate the configuration')
    .option('--no-interpolate', 'do not interpolate environment variables')
    .option('--services', 'print service names')
    .option('--volumes', 'print volume names')
    .option('--profiles', 'print profile names')
    .option('--format <format>', 'output format')
    .action(async (options: ComposeCliOptions & { services?: boolean; profiles?: boolean }) =>
      runSimpleComposeCommand('config', [], createConfigComposeCliOptions(options)),
    );

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

function registerProjectCommands(program: Command): void {
  const project = program.command('project').description('Create and maintain Compose projects.');

  project
    .command('init')
    .argument('<directory>', 'project directory')
    .option('--name <name>', 'Compose project name')
    .option('--overwrite', 'overwrite an existing compose.yaml')
    .action(async (directory: string, options: { name?: string; overwrite?: boolean }) => {
      const created = await createComposeProject(directory, createComposeProjectOptions(options));
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
      const composeFilePath = await resolveComposeFilePath(options.project);
      const projectModel = await loadComposeProject(composeFilePath);
      projectModel.document = addService(
        projectModel.document,
        service,
        {
          ...(options.image === undefined ? {} : { image: options.image }),
          ...(options.build === undefined ? {} : { build: options.build }),
          ...(options.port === undefined ? {} : { ports: options.port }),
          ...(options.volume === undefined ? {} : { volumes: options.volume }),
          ...(options.env === undefined ? {} : { environment: toEnvironmentRecord(options.env) }),
          ...(options.dependsOn === undefined ? {} : { depends_on: options.dependsOn }),
        },
        createAddServiceOptions(options.overwrite),
      );
      await saveComposeProject(projectModel);
      console.log(`Updated ${projectModel.composeFilePath}`);
    });

  project
    .command('remove-service')
    .argument('<service>', 'service name')
    .requiredOption('--project <path>', 'project directory or Compose file')
    .action(async (service: string, options: { project: string }) => {
      const composeFilePath = await resolveComposeFilePath(options.project);
      const projectModel = await loadComposeProject(composeFilePath);
      projectModel.document = removeService(projectModel.document, service);
      await saveComposeProject(projectModel);
      console.log(`Updated ${projectModel.composeFilePath}`);
    });

  project
    .command('update-service')
    .argument('<service>', 'service name')
    .requiredOption('--project <path>', 'project directory or Compose file')
    .option('--image <image>', 'service image')
    .option('--build <path>', 'build context')
    .action(async (service: string, options: ProjectServiceCliOptions) => {
      const composeFilePath = await resolveComposeFilePath(options.project);
      const projectModel = await loadComposeProject(composeFilePath);
      projectModel.document = updateService(projectModel.document, service, {
        ...(options.image === undefined ? {} : { image: options.image }),
        ...(options.build === undefined ? {} : { build: options.build }),
      });
      await saveComposeProject(projectModel);
      console.log(`Updated ${projectModel.composeFilePath}`);
    });

  project
    .command('validate')
    .requiredOption('--project <path>', 'project directory or Compose file')
    .action(async (options: { project: string }) => {
      const composeFilePath = await resolveComposeFilePath(options.project);
      await parseComposeDocument(composeFilePath);
      console.log(`Valid Compose file: ${composeFilePath}`);
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
  const composeFilePath = await resolveComposeFilePath(options.project, options.file);
  const availableServices = await getAvailableServicesForGuidance(composeFilePath, options.guided === true);
  const guided = await resolveGuidedCommand(
    {
      command,
      options,
      services,
      passthroughArgs,
      availableServices,
    },
    inquirerPromptAdapter,
  );

  await executeAndPrint({
    command,
    composeFilePath,
    services: guided.services,
    passthroughArgs: guided.passthroughArgs,
    options: guided.options,
  });
}

async function executeAndPrint(request: {
  command: ComposeSubCommand;
  composeFilePath: string;
  services: string[];
  passthroughArgs: string[];
  options: ComposeCliOptions;
}): Promise<void> {
  const executionRequest = {
    composeFilePath: request.composeFilePath,
    workingDirectory: dirname(request.composeFilePath),
    command: request.command,
    services: request.services,
    passthroughArgs: request.passthroughArgs,
    options: request.options,
  };

  if (request.options.dryRun === true) {
    console.log(buildComposeCommand(executionRequest).displayCommand);
    return;
  }

  const result = await executeComposeCommand(executionRequest);

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

async function getAvailableServicesForGuidance(composeFilePath: string, guided: boolean): Promise<string[]> {
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

function createConfigComposeCliOptions(options: ComposeCliOptions & { services?: boolean; profiles?: boolean }): ComposeCliOptions {
  return {
    ...options,
    ...(options.services === undefined ? {} : { servicesOnly: options.services }),
    ...(options.volumes === undefined ? {} : { volumesOnly: options.volumes }),
    ...(options.profiles === undefined ? {} : { profilesOnly: options.profiles }),
  };
}

function createScanComposeFilesOptions(maxDepth: number | undefined): ScanComposeFilesOptions {
  return maxDepth === undefined ? {} : { maxDepth };
}

function createComposeProjectOptions(options: { name?: string; overwrite?: boolean }): CreateComposeProjectOptions {
  return {
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.overwrite === undefined ? {} : { overwrite: options.overwrite }),
  };
}

function createAddServiceOptions(overwrite: boolean | undefined): AddServiceOptions {
  return overwrite === undefined ? {} : { overwrite };
}

function parseInteger(value: string): number {
  const parsedValue = Number.parseInt(value, 10);

  if (Number.isNaN(parsedValue)) {
    throw new Error(`Invalid integer: ${value}`);
  }

  return parsedValue;
}

function toEnvironmentRecord(entries: string[]): Record<string, string> {
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

type ComposeCliOptions = {
  project?: string;
  file?: string;
  projectName?: string;
  profile?: string[];
  dryRun?: boolean;
  noAnsi?: boolean;
  guided?: boolean;
  yes?: boolean;
  interactive?: boolean;
  detach?: boolean;
  removeOrphans?: boolean;
  volumes?: boolean;
  build?: boolean;
  noBuild?: boolean;
  noCache?: boolean;
  pull?: boolean;
  follow?: boolean;
  tail?: string;
  scale?: string[];
  rm?: boolean;
  force?: boolean;
  stop?: boolean;
  timeout?: string;
  signal?: string;
  all?: boolean;
  quiet?: boolean;
  format?: string;
  json?: boolean;
  noInterpolate?: boolean;
  servicesOnly?: boolean;
  volumesOnly?: boolean;
  profilesOnly?: boolean;
  services?: boolean;
  profiles?: boolean;
  short?: boolean;
  noUp?: boolean;
  env?: string[];
  user?: string;
  workdir?: string;
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
