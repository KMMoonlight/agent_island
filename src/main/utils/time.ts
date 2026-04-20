export function parseTimestampToMillis(input: string | undefined): number | null {
  if (!input) {
    return null;
  }

  const date = new Date(input);
  const time = date.getTime();

  return Number.isNaN(time) ? null : time;
}
