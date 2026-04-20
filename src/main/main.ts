import './env-setup';

import path from 'node:path';

import { app } from 'electron';
import type { BrowserWindow } from 'electron';

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
import { createOverlayHost } from './windows/create-overlay-host';
import type { OverlayHost } from './windows/overlay-host';

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

let overlayHost: OverlayHost | null = null;
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
  overlayHost = createOverlayHost(loadRenderer);
  await overlayHost.load();

  overlayHost.showInactive();

  const hostStatus = overlayHost.getStatus();
  logger.info('Overlay host ready', hostStatus);

  overlayHost.onClosed(() => {
    overlayHost = null;
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

    if (!overlayHost || overlayHost.isDestroyed()) {
      return;
    }

    overlayHost.send(IPC_CHANNELS.OVERLAY.UPDATED, state);
  });
}

app.whenReady().then(async () => {
  registerOverlayHandlers(sourceStore);
  registerConfigHandlers(sourcePoller, sourceStore);
  registerAppControlHandlers(sourceStore, {
    getOverlayMode: () => overlayWindowMode,
    setOverlayExpanded: (expanded) => {
      overlayWindowMode = expanded ? 'expanded' : 'compact';

      if (!overlayHost || overlayHost.isDestroyed()) {
        return overlayWindowMode;
      }

      return overlayHost.setMode(overlayWindowMode);
    },
  });
  wireStoreUpdates();

  sourcePoller.start();
  trayMenu.create(sourceStore.getStatus());
  await createApp();

  app.on('activate', async () => {
    if (overlayHost === null || overlayHost.isDestroyed()) {
      await createApp();
      return;
    }

    overlayHost.showInactive();
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
