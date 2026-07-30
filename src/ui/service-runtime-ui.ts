export function extractPublishedHostPorts(values: string[]): number[] {
  const ports = new Set<number>();

  for (const value of values) {
    for (const segment of value.split(',')) {
      const port = extractPublishedHostPort(segment);
      if (port !== undefined) ports.add(port);
    }
  }

  return [...ports].sort((left, right) => left - right);
}

export function extractPublishedHostPort(value: string): number | undefined {
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;

  const arrow = normalized.indexOf('->');
  if (arrow < 0 && !normalized.includes(':')) return undefined;

  const publishedPart = (arrow < 0 ? normalized : normalized.slice(0, arrow))
    .replace(/\/(tcp|udp)$/i, '')
    .trim();
  const bracketed = /^\[[^\]]+\]:(\d+)$/.exec(publishedPart);
  const plain = /(?:^|:)(\d+)$/.exec(publishedPart);
  const portValue = bracketed?.[1] ?? plain?.[1];

  if (portValue === undefined) return undefined;

  const port = Number(portValue);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined;
}
