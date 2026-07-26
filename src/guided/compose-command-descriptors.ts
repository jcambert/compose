import type { ComposeSubCommand } from '../compose/compose-command.js';
import type { GuidedCommandDescriptor } from './guided-command-descriptor.js';

const descriptors: Partial<Record<ComposeSubCommand, GuidedCommandDescriptor>> = {
  up: {
    command: 'up',
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
  logs: {
    command: 'logs',
    serviceSelection: {
      required: false,
      multiple: true,
      message: 'Select services to show logs for. Leave empty for all services.',
      emptySelectionMeansAll: true,
    },
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
    serviceSelection: {
      required: false,
      multiple: true,
      message: 'Select services to build. Leave empty for all services.',
      emptySelectionMeansAll: true,
    },
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
    serviceSelection: {
      required: false,
      multiple: true,
      message: 'Select services to pull. Leave empty for all services.',
      emptySelectionMeansAll: true,
    },
    options: [],
  },
  restart: {
    command: 'restart',
    serviceSelection: {
      required: false,
      multiple: true,
      message: 'Select services to restart. Leave empty for all services.',
      emptySelectionMeansAll: true,
    },
    options: [],
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
  return Object.values(descriptors);
}
