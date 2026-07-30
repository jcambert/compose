import { describe, expect, it } from 'vitest';
import { createPublishedPortLink } from '../../src/ui/service-runtime-ui';

describe('service runtime UI port links', () => {
  it.each([
    ['0.0.0.0:3000->3000/tcp', 'http://localhost:3000', 'localhost:3000 → 3000'],
    ['[::]:8443->443/tcp', 'https://localhost:8443', 'localhost:8443 → 443'],
    ['127.0.0.1:8080->80/tcp', 'http://127.0.0.1:8080', '127.0.0.1:8080 → 80'],
    ['localhost:5173', 'http://localhost:5173', 'localhost:5173'],
  ])('creates a browser endpoint for %s', (value, href, label) => expect(createPublishedPortLink(value)).toMatchObject({ href, label }));
  it('ignores non-published descriptions', () => { expect(createPublishedPortLink('3000/tcp')).toBeUndefined(); expect(createPublishedPortLink('')).toBeUndefined(); });
});
