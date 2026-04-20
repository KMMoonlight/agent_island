import './env-setup';

import path from 'node:path';

import { BrowserWindow, app } from 'electron';

import { IPC_CHANNELS } from '../shared/constants/channels';
import type { OverlayWindowMode } from '../shared/types/ipc';
import { registerAppControlHandlers } from './ipc/app-control.handler';
import { registerConfigHandlers } from './ipc/config.handler';
import { registerOverlayHandlers } from './ipc/overlay.handler';
import { logger as baseLogger } from './services/logger';
import { ConfigService } from './services/config/config-service';
import { SourcePoller } from './services/sources/source-poller';
import { SourceStore } from './services/state/source-store';
import { TrayMenu } from './tray/tray-menu';
import { createOverlayWindow, setOverlayWindowMode } from './windows/overlay-window';

const logger = baseLogger.scope('main');
const configService = new ConfigService();
const sourceStore = new SourceStore();
const sourcePoller = new SourcePoller(configService, sourceStore);
const trayMenu = new TrayMenu({
  onReload: () => {
    void reloadSources();
  },
  onOpenConfig: () => {
    configService.revealConfigFile();
  },
});

let overlayWindow: BrowserWindow | null = null;
let overlayWindowMode: OverlayWindowMode = 'compact';

async function loadRenderer(window: BrowserWindow): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
    return;
  }

  await window.loadFile(path.join(__dirname, '../renderer/index.html'));
}

async function createApp(): Promise<void> {
  overlayWindowMode = 'compact';
  overlayWindow = createOverlayWindow();
  await loadRenderer(overlayWindow);

  overlayWindow.once('ready-to-show', () => {
    overlayWindow?.showInactive();
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    overlayWindowMode = 'compact';
  });
}

async function reloadSources(): Promise<void> {
  try {
    await sourcePoller.reload();
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown reload error');
    logger.error('Config reload failed', { message: normalizedError.message });
  }
}

function wireStoreUpdates(): void {
  sourceStore.subscribe((state) => {
    trayMenu.update(sourceStore.getStatus());

    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return;
    }

    overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY.UPDATED, state);
  });
}

app.whenReady().then(async () => {
  registerOverlayHandlers(sourceStore);
  registerConfigHandlers(sourcePoller, sourceStore);
  registerAppControlHandlers(sourceStore, {
    getOverlayMode: () => overlayWindowMode,
    setOverlayExpanded: (expanded) => {
      overlayWindowMode = expanded ? 'expanded' : 'compact';

      if (!overlayWindow || overlayWindow.isDestroyed()) {
        return overlayWindowMode;
      }

      return setOverlayWindowMode(overlayWindow, overlayWindowMode);
    },
  });
  wireStoreUpdates();

  await sourcePoller.start();
  trayMenu.create(sourceStore.getStatus());
  await createApp();

  app.on('activate', async () => {
    if (overlayWindow === null || overlayWindow.isDestroyed()) {
      await createApp();
      return;
    }

    overlayWindow.showInactive();
  });
});

app.on('before-quit', () => {
  sourcePoller.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
