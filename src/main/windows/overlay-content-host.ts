import type { BrowserWindow } from 'electron';

export type OverlayContentHost = {
  loadURL: (url: string) => Promise<void>;
  loadFile: (filePath: string) => Promise<void>;
  send: (channel: string, payload: unknown) => void;
  isDestroyed: () => boolean;
};

export function createBrowserWindowContentHost(window: BrowserWindow): OverlayContentHost {
  return {
    loadURL: (url) => window.loadURL(url),
    loadFile: (filePath) => window.loadFile(filePath),
    send: (channel, payload) => {
      window.webContents.send(channel, payload);
    },
    isDestroyed: () => window.isDestroyed(),
  };
}
