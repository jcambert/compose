import { describe, expect, it } from 'vitest';
import { getAllGuidedCommandDescriptors, getGuidedCommandDescriptor } from '../../src/guided/compose-command-descriptors.js';

describe('guided command descriptors', () => {
  it('returns descriptor for compose up options', () => {
    const descriptor = getGuidedCommandDescriptor('up');

    expect(descriptor.command).toBe('up');
    expect(descriptor.options.map((option) => option.key)).toEqual(['detach', 'build', 'removeOrphans', 'scale']);
    expect(descriptor.options.find((option) => option.key === 'detach')?.safeDefault).toBe(true);
  });

  it('marks down volumes as destructive', () => {
    const descriptor = getGuidedCommandDescriptor('down');
    const volumes = descriptor.options.find((option) => option.key === 'volumes');

    expect(volumes?.destructive).toBe(true);
    expect(volumes?.safeDefault).toBe(false);
  });

  it('returns an empty descriptor for commands without guidance', () => {
    const descriptor = getGuidedCommandDescriptor('ps');

    expect(descriptor.command).toBe('ps');
    expect(descriptor.options).toEqual([]);
  });

  it('lists configured descriptors', () => {
    const descriptors = getAllGuidedCommandDescriptors();

    expect(descriptors.map((descriptor) => descriptor.command)).toContain('exec');
    expect(descriptors.map((descriptor) => descriptor.command)).toContain('run');
  });
});
