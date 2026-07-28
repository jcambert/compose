import { describe, expect, it } from 'vitest';
import { toEnvironmentRecord } from '../../src/app/project-service.js';

describe('project application service', () => {
  it('converts environment entries to a record', () => {
    expect(toEnvironmentRecord(['NODE_ENV=test', 'PORT=3000'])).toEqual({
      NODE_ENV: 'test',
      PORT: '3000',
    });
  });

  it('rejects invalid environment entries', () => {
    expect(() => toEnvironmentRecord(['NODE_ENV'])).toThrow('Invalid environment entry: NODE_ENV');
  });
});
