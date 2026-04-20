import { shell } from 'electron';

export async function openExternalTarget(targetUrl: string): Promise<boolean> {
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    return false;
  }

  await shell.openExternal(targetUrl);
  return true;
}
