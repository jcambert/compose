import type { ComposeSubCommand } from '../compose/compose-command.js';
import type { GuidedCommandDescriptor } from './guided-command-descriptor.js';

const serviceSelection = (message: string): GuidedCommandDescriptor['serviceSelection'] => ({
  required: false,
  multiple: true,
  message,
  emptySelectionMeansAll: true,
});

const descriptors: Partial<Record<ComposeSubCommand, GuidedCommandDescriptor>> = {
  up: {
    command: 'up',
    serviceSelection: serviceSelection('Select services to start. Leave empty for all services.'),
    options: [
      {
        key: 'detach',
        flag: '--detach',
        description: 'Run containers in the background.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Start containers in detached mode?',
        defaultValue: true,
        safeDefault: true,
      },
      {
        key: 'build',
        flag: '--build',
        description: 'Build images before starting containers.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Build images before starting?',
        defaultValue: false,
        safeDefault: false,
      },
      {
        key: 'removeOrphans',
        flag: '--remove-orphans',
        description: 'Remove containers for services not defined in the Compose file.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Remove orphan containers?',
        defaultValue: false,
        safeDefault: false,
      },
      {
        key: 'scale',
        flag: '--scale',
        description: 'Scale services using service=count entries.',
        valueType: 'string[]',
        promptKind: 'input',
        message: 'Scale services? Enter comma-separated service=count values, or leave empty.',
        emptyInputMeansUnset: true,
      },
    ],
  },
  down: {
    command: 'down',
    options: [
      {
        key: 'removeOrphans',
        flag: '--remove-orphans',
        description: 'Remove containers for services not defined in the Compose file.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Remove orphan containers?',
        defaultValue: false,
        safeDefault: false,
      },
      {
        key: 'volumes',
        flag: '--volumes',
        description: 'Remove named volumes declared in the Compose file.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Remove named volumes? This can delete persisted local data.',
        defaultValue: false,
        safeDefault: false,
        destructive: true,
      },
    ],
  },
  ps: {
    command: 'ps',
    serviceSelection: serviceSelection('Select services to inspect. Leave empty for all services.'),
    options: [
      {
        key: 'all',
        flag: '--all',
        description: 'Show all containers.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Show all containers?',
        defaultValue: false,
        safeDefault: false,
      },
      {
        key: 'quiet',
        flag: '--quiet',
        description: 'Only display IDs.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Only display container IDs?',
        defaultValue: false,
        safeDefault: false,
      },
    ],
  },
  logs: {
    command: 'logs',
    serviceSelection: serviceSelection('Select services to show logs for. Leave empty for all services.'),
    options: [
      {
        key: 'follow',
        flag: '--follow',
        description: 'Follow log output.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Follow log output?',
        defaultValue: true,
        safeDefault: true,
      },
      {
        key: 'tail',
        flag: '--tail',
        description: 'Number of log lines to show from the end.',
        valueType: 'string',
        promptKind: 'input',
        message: 'Limit log lines? Enter a number, or leave empty for Docker default.',
        emptyInputMeansUnset: true,
      },
    ],
  },
  build: {
    command: 'build',
    serviceSelection: serviceSelection('Select services to build. Leave empty for all services.'),
    options: [
      {
        key: 'noCache',
        flag: '--no-cache',
        description: 'Do not use cache when building images.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Build without cache?',
        defaultValue: false,
        safeDefault: false,
      },
      {
        key: 'pull',
        flag: '--pull',
        description: 'Always attempt to pull newer image versions.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Pull newer base images before building?',
        defaultValue: false,
        safeDefault: false,
      },
    ],
  },
  pull: {
    command: 'pull',
    serviceSelection: serviceSelection('Select services to pull. Leave empty for all services.'),
    options: [],
  },
  restart: {
    command: 'restart',
    serviceSelection: serviceSelection('Select services to restart. Leave empty for all services.'),
    options: [
      {
        key: 'timeout',
        flag: '--timeout',
        description: 'Shutdown timeout in seconds.',
        valueType: 'string',
        promptKind: 'input',
        message: 'Shutdown timeout in seconds? Leave empty for Docker default.',
        emptyInputMeansUnset: true,
      },
    ],
  },
  start: {
    command: 'start',
    serviceSelection: serviceSelection('Select services to start. Leave empty for all services.'),
    options: [],
  },
  stop: {
    command: 'stop',
    serviceSelection: serviceSelection('Select services to stop. Leave empty for all services.'),
    options: [
      {
        key: 'timeout',
        flag: '--timeout',
        description: 'Shutdown timeout in seconds.',
        valueType: 'string',
        promptKind: 'input',
        message: 'Shutdown timeout in seconds? Leave empty for Docker default.',
        emptyInputMeansUnset: true,
      },
    ],
  },
  create: {
    command: 'create',
    serviceSelection: serviceSelection('Select services to create. Leave empty for all services.'),
    options: [
      {
        key: 'build',
        flag: '--build',
        description: 'Build images before creating containers.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Build images before creating containers?',
        defaultValue: false,
        safeDefault: false,
      },
      {
        key: 'removeOrphans',
        flag: '--remove-orphans',
        description: 'Remove containers for services not defined in the Compose file.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Remove orphan containers?',
        defaultValue: false,
        safeDefault: false,
      },
    ],
  },
  pause: {
    command: 'pause',
    serviceSelection: serviceSelection('Select services to pause. Leave empty for all services.'),
    options: [],
  },
  unpause: {
    command: 'unpause',
    serviceSelection: serviceSelection('Select services to unpause. Leave empty for all services.'),
    options: [],
  },
  kill: {
    command: 'kill',
    serviceSelection: serviceSelection('Select services to kill. Leave empty for all services.'),
    options: [
      {
        key: 'signal',
        flag: '--signal',
        description: 'Signal to send to containers.',
        valueType: 'string',
        promptKind: 'input',
        message: 'Signal to send? Leave empty for Docker default.',
        emptyInputMeansUnset: true,
        destructive: true,
      },
    ],
  },
  rm: {
    command: 'rm',
    serviceSelection: serviceSelection('Select services to remove. Leave empty for stopped containers.'),
    options: [
      {
        key: 'force',
        flag: '--force',
        description: 'Do not ask for confirmation.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Force removal without Docker confirmation?',
        defaultValue: false,
        safeDefault: false,
        destructive: true,
      },
      {
        key: 'stop',
        flag: '--stop',
        description: 'Stop containers before removing.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Stop containers before removing them?',
        defaultValue: false,
        safeDefault: false,
        destructive: true,
      },
      {
        key: 'volumes',
        flag: '--volumes',
        description: 'Remove anonymous volumes attached to containers.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Remove anonymous volumes?',
        defaultValue: false,
        safeDefault: false,
        destructive: true,
      },
    ],
  },
  config: {
    command: 'config',
    options: [
      {
        key: 'quiet',
        flag: '--quiet',
        description: 'Only validate the configuration.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Only validate the configuration?',
        defaultValue: false,
        safeDefault: false,
      },
      {
        key: 'noInterpolate',
        flag: '--no-interpolate',
        description: 'Do not interpolate environment variables.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Disable environment interpolation?',
        defaultValue: false,
        safeDefault: false,
      },
    ],
  },
  cp: {
    command: 'cp',
    passthrough: {
      required: true,
      message: 'Copy arguments as source and target, for example api:/tmp/file ./file.',
    },
    options: [],
  },
  events: {
    command: 'events',
    serviceSelection: serviceSelection('Select services to filter events. Leave empty for all services.'),
    options: [
      {
        key: 'json',
        flag: '--json',
        description: 'Output events as JSON.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Output events as JSON?',
        defaultValue: false,
        safeDefault: false,
      },
    ],
  },
  images: {
    command: 'images',
    serviceSelection: serviceSelection('Select services to list images for. Leave empty for all services.'),
    options: [
      {
        key: 'quiet',
        flag: '--quiet',
        description: 'Only display image IDs.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Only display image IDs?',
        defaultValue: false,
        safeDefault: false,
      },
    ],
  },
  ls: {
    command: 'ls',
    options: [
      {
        key: 'all',
        flag: '--all',
        description: 'Show stopped Compose projects.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Show stopped Compose projects?',
        defaultValue: false,
        safeDefault: false,
      },
      {
        key: 'quiet',
        flag: '--quiet',
        description: 'Only display project IDs.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Only display project IDs?',
        defaultValue: false,
        safeDefault: false,
      },
    ],
  },
  port: {
    command: 'port',
    serviceSelection: {
      required: true,
      multiple: false,
      message: 'Select the service to inspect.',
    },
    passthrough: {
      required: true,
      message: 'Private container port to resolve.',
    },
    options: [],
  },
  top: {
    command: 'top',
    serviceSelection: serviceSelection('Select services to inspect processes for. Leave empty for all services.'),
    options: [],
  },
  version: {
    command: 'version',
    options: [
      {
        key: 'short',
        flag: '--short',
        description: 'Only show the version number.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Only show the version number?',
        defaultValue: false,
        safeDefault: false,
      },
    ],
  },
  watch: {
    command: 'watch',
    serviceSelection: serviceSelection('Select services to watch. Leave empty for all services.'),
    options: [
      {
        key: 'noUp',
        flag: '--no-up',
        description: 'Do not build and start services before watching.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Skip initial up before watching?',
        defaultValue: false,
        safeDefault: false,
      },
    ],
  },
  run: {
    command: 'run',
    serviceSelection: {
      required: true,
      multiple: false,
      message: 'Select the service to run.',
    },
    passthrough: {
      required: false,
      message: 'Command to run in the service container. Leave empty for the service default command.',
    },
    options: [
      {
        key: 'rm',
        flag: '--rm',
        description: 'Remove the container after the command exits.',
        valueType: 'boolean',
        promptKind: 'confirm',
        message: 'Remove the container after run?',
        defaultValue: true,
        safeDefault: true,
      },
      {
        key: 'env',
        flag: '--env',
        description: 'Environment variables passed as key=value.',
        valueType: 'string[]',
        promptKind: 'input',
        message: 'Add environment variables? Enter comma-separated key=value values, or leave empty.',
        emptyInputMeansUnset: true,
      },
    ],
  },
  exec: {
    command: 'exec',
    serviceSelection: {
      required: true,
      multiple: false,
      message: 'Select the service to exec into.',
    },
    passthrough: {
      required: true,
      message: 'Command to execute in the service container.',
      defaultValue: 'sh',
    },
    options: [
      {
        key: 'env',
        flag: '--env',
        description: 'Environment variables passed as key=value.',
        valueType: 'string[]',
        promptKind: 'input',
        message: 'Add environment variables? Enter comma-separated key=value values, or leave empty.',
        emptyInputMeansUnset: true,
      },
      {
        key: 'user',
        flag: '--user',
        description: 'Run the command as a specific user.',
        valueType: 'string',
        promptKind: 'input',
        message: 'Run as a specific user? Leave empty for Docker default.',
        emptyInputMeansUnset: true,
      },
      {
        key: 'workdir',
        flag: '--workdir',
        description: 'Working directory inside the container.',
        valueType: 'string',
        promptKind: 'input',
        message: 'Use a specific working directory? Leave empty for Docker default.',
        emptyInputMeansUnset: true,
      },
    ],
  },
};

export function getGuidedCommandDescriptor(command: ComposeSubCommand): GuidedCommandDescriptor {
  return descriptors[command] ?? {
    command,
    options: [],
  };
}

export function getAllGuidedCommandDescriptors(): GuidedCommandDescriptor[] {
  return Object.values(descriptors).filter(isGuidedCommandDescriptor);
}

function isGuidedCommandDescriptor(value: GuidedCommandDescriptor | undefined): value is GuidedCommandDescriptor {
  return value !== undefined;
}
