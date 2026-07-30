export type PublishedPortLink = { href: string; label: string; title: string };

export function createPublishedPortLink(value: string): PublishedPortLink | undefined {
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  const arrow = normalized.indexOf('->');
  if (arrow < 0 && !normalized.includes(':')) return undefined;
  const publishedPart = arrow < 0 ? normalized : normalized.slice(0, arrow);
  const targetPart = arrow < 0 ? undefined : normalized.slice(arrow + 2);
  const published = parseHostAndPort(publishedPart.replace(/\/(tcp|udp)$/i, ''));
  if (published === undefined) return undefined;
  const targetPort = targetPart?.match(/(\d+)(?:\/(tcp|udp))?$/i)?.[1];
  const protocol = published.port === 443 || published.port === 8443 || targetPort === '443' ? 'https' : 'http';
  const host = normalizeBrowserHost(published.host);
  return { href: `${protocol}://${formatUrlHost(host)}:${published.port}`, label: `${host}:${published.port}${targetPort === undefined ? '' : ` → ${targetPort}`}`, title: `Open ${protocol.toUpperCase()} endpoint for ${normalized}` };
}

function parseHostAndPort(value: string): { host: string; port: number } | undefined {
  const bracketed = /^\[([^\]]+)\]:(\d+)$/.exec(value);
  if (bracketed?.[1] !== undefined && bracketed[2] !== undefined) return { host: bracketed[1], port: Number(bracketed[2]) };
  const segments = value.split(':');
  const portValue = segments.pop();
  if (portValue === undefined || !/^\d+$/.test(portValue)) return undefined;
  return { host: segments.join(':') || 'localhost', port: Number(portValue) };
}

function normalizeBrowserHost(host: string): string {
  const normalized = host.trim().toLowerCase();
  return normalized === '' || normalized === '0.0.0.0' || normalized == '::' || normalized === '[::]' || normalized === '*' ? 'localhost' : host;
}

function formatUrlHost(host: string): string { return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host; }
