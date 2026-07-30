import { describe, expect, it } from 'vitest';
import { extractPublishedHostPort, extractPublishedHostPorts } from '../../src/ui/service-runtime-ui';

describe('service runtime UI published ports', () => {
  it.each([
    ['0.0.0.0:3000->3000/tcp', 3000],
    ['[::]:8443->443/tcp', 8443],
    ['127.0.0.1:8080->80/tcp', 8080],
    ['localhost:5173', 5173],
  ])('extracts the local published port from %s', (value, expected) => {
    expect(extractPublishedHostPort(value)).toBe(expected);
  });

  it('returns all unique local ports from Docker output', () => {
    expect(extractPublishedHostPorts([
      '0.0.0.0:6832->12345/tcp, [::]:6832->12345/tcp',
      '0.0.0.0:3100->3100/tcp',
      '127.0.0.1:9095->9095/tcp',
    ])).toEqual([3100, 6832, 9095]);
  });

  it('ignores internal-only and invalid ports', () => {
    expect(extractPublishedHostPort('3000/tcp')).toBeUndefined();
    expect(extractPublishedHostPort('')).toBeUndefined();
    expect(extractPublishedHostPort('0.0.0.0:70000->80/tcp')).toBeUndefined();
  });
});
