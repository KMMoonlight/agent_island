export function getValueAtPath(input: unknown, path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }

  const segments = path.split('.').filter(Boolean);
  let current: unknown = input;

  for (const segment of segments) {
    if (typeof current !== 'object' || current === null || !(segment in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  if (current === null || current === undefined) {
    return undefined;
  }

  if (typeof current === 'string') {
    return current;
  }

  if (typeof current === 'number' || typeof current === 'boolean') {
    return String(current);
  }

  return undefined;
}
