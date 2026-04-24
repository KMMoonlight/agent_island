import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BrowserWindow } from 'electron';

import type { OverlayRendererTarget } from './overlay-host';

let configWindow: BrowserWindow | null = null;
const mainModuleDirectory = path.dirname(fileURLToPath(import.meta.url));

function buildConfigUrl(rendererTarget: OverlayRendererTarget): { kind: 'url' | 'file'; value: string } {
  if (rendererTarget.kind === 'url') {
    return {
      kind: 'url',
      value: new URL('#/config', rendererTarget.value).toString(),
    };
  }

  return {
    kind: 'file',
    value: rendererTarget.value,
  };
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    title: 'Source Settings',
    backgroundColor: '#080808',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(mainModuleDirectory, '../preload/preload.mjs'),
      contextIsolation: true,
      sandbox: false,
    },
  });

  window.on('closed', () => {
    configWindow = null;
  });

  return window;
}

export async function createConfigWindow(rendererTarget: OverlayRendererTarget): Promise<BrowserWindow> {
  if (configWindow && !configWindow.isDestroyed()) {
    if (configWindow.isMinimized()) {
      configWindow.restore();
    }

    configWindow.focus();
    return configWindow;
  }

  configWindow = createWindow();
  const target = buildConfigUrl(rendererTarget);

  if (target.kind === 'url') {
    await configWindow.loadURL(target.value);
  } else {
    await configWindow.loadFile(target.value, { hash: '/config' });
  }

  configWindow.show();
  configWindow.focus();

  return configWindow;
}
