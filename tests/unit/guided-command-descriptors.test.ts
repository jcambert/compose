import { describe, expect, it } from 'vitest';
import { getAllGuidedCommandDescriptors, getGuidedCommandDescriptor } from '../../src/guided/compose-command-descriptors.js';

const expectedCommands = [
  'up',
  'down',
  'ps',
  'logs',
  'build',
  'pull',
  'restart',
  'start',
  'stop',
  'create',
  'pause',
  'unpause',
  'kill',
  'rm',
  'config',
  'cp',
  'events',
  'images',
  'ls',
  'port',
  'top',
  'version',
  'watch',
  'run',
  'exec',
];

describe('guided command descriptors', () => {
  it('returns descriptor for compose up options', () => {
    const descriptor = getGuidedCommandDescriptor('up');

    expect(descriptor.command).toBe('up');
    expect(descriptor.options.map((option) => option.key)).toEqual(['detach', 'build', 'removeOrphans', 'scale']);
    expect(descriptor.options.find((option) => option.key === 'detach')?.safeDefault).toBe(true);
    expect(descriptor.serviceSelection?.emptySelectionMeansAll).toBe(true);
  });

  it('marks down volumes as destructive', () => {
    const descriptor = getGuidedCommandDescriptor('down');
    const volumes = descriptor.options.find((option) => option.key === 'volumes');

    expect(volumes?.destructive).toBe(true);
    expect(volumes?.safeDefault).toBe(false);
  });

  it('marks kill and rm guidance as destructive', () => {
    const kill = getGuidedCommandDescriptor('kill');
    const rm = getGuidedCommandDescriptor('rm');

    expect(kill.options.find((option) => option.key === 'signal')?.destructive).toBe(true);
    expect(rm.options.every((option) => option.destructive === true)).toBe(true);
  });

  it('defines passthrough guidance for cp and port', () => {
    const cp = getGuidedCommandDescriptor('cp');
    const port = getGuidedCommandDescriptor('port');

    expect(cp.passthrough?.required).toBe(true);
    expect(port.serviceSelection?.required).toBe(true);
    expect(port.passthrough?.required).toBe(true);
  });

  it('lists configured descriptors for the command surface', () => {
    const descriptors = getAllGuidedCommandDescriptors();
    const commands = descriptors.map((descriptor) => descriptor.command);

    for (const command of expectedCommands) {
      expect(commands).toContain(command);
    }
  });
});
