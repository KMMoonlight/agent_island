import './env-setup';

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

import { app, BrowserWindow } from 'electron';

import { IPC_CHANNELS } from '../shared/constants/channels';
import { APP_CONFIG } from '../shared/constants/config';
import type { OverlayWindowMode } from '../shared/types/ipc';
import { registerAgentHandlers } from './ipc/agent.handler';
import { registerAppControlHandlers } from './ipc/app-control.handler';
import { registerConfigHandlers } from './ipc/config.handler';
import { registerOverlayHandlers } from './ipc/overlay.handler';
import { logger as baseLogger } from './services/logger';
import { AgentHookService } from './services/agents/agent-hook-service';
import { ConfigService } from './services/config/config-service';
import { SourcePoller } from './services/sources/source-poller';
import { SourceStore } from './services/state/source-store';
import { TrayMenu } from './tray/tray-menu';
import { createBrowserOverlayHost } from './windows/browser-overlay-host';
import { createConfigWindow } from './windows/config-window';
import { createOverlayHost } from './windows/create-overlay-host';
import type { OverlayContentHost } from './windows/overlay-content-host';
import type { OverlayHost, OverlayHostBridge, OverlayRendererTarget } from './windows/overlay-host';
import { jumpToTerminalWindow } from './utils/jump-to-terminal';
import { openExternalTarget } from './utils/open-external';

const logger = baseLogger.scope('main');
const configService = new ConfigService();
const sourceStore = new SourceStore();
const sourcePoller = new SourcePoller(configService, sourceStore);
const agentHookService = new AgentHookService(sourceStore);
const trayMenu = new TrayMenu({
  onRefreshSources: () => {
    void refreshSources();
  },
  onOpenConfig: () => {
    void createConfigWindow(getOverlayRendererTarget());
  },
});

let overlayHost: OverlayHost | null = null;
let overlayWindowMode: OverlayWindowMode = 'compact';
let expandedContentHeight: number = APP_CONFIG.window.expandedHeight;

function clearMacOsSavedState(): void {
  if (process.platform !== 'darwin') {
    return;
  }

  const savedStatePath = path.join(os.homedir(), 'Library', 'Saved Application State', 'com.github.Electron.savedState');

  if (!fs.existsSync(savedStatePath)) {
    return;
  }

  try {
    fs.rmSync(savedStatePath, { force: true, recursive: true });
  } catch {
    // Ignore saved state cleanup failures to avoid extra startup noise on macOS.
  }
}

function getOverlayRendererTarget(): OverlayRendererTarget {
  if (process.env.ELECTRON_RENDERER_URL) {
    return {
      kind: 'url',
      value: process.env.ELECTRON_RENDERER_URL,
    };
  }

  return {
    kind: 'file',
    value: path.join(__dirname, '../renderer/index.html'),
  };
}

async function loadRenderer(contentHost: OverlayContentHost): Promise<void> {
  const rendererTarget = getOverlayRendererTarget();

  logger.info('Loading overlay renderer', {
    rendererTarget,
  });

  if (rendererTarget.kind === 'url') {
    await contentHost.loadURL(rendererTarget.value);
    logger.info('Overlay renderer loaded from dev server');
    return;
  }

  await contentHost.loadFile(rendererTarget.value);
  logger.info('Overlay renderer loaded from built file');
}

const overlayHostBridge: OverlayHostBridge = {
  getOverlayState: () => sourceStore.getState(),
  getConfig: () => configService.getConfig(),
  saveConfig: async (config) => {
    const savedConfig = configService.saveConfig(config);
    sourcePoller.reload();
    return savedConfig;
  },
  validateConfig: (candidate) => {
    try {
      return {
        ok: true,
        config: configService.validateConfig(candidate),
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Config validation failed',
      };
    }
  },
  refreshSources: async () => {
    sourcePoller.reload();
    return sourceStore.getState();
  },
  getAgentSetup: () => agentHookService.getSetup(),
  resolveAgentApproval: (sessionId, decision) => agentHookService.resolvePendingApproval(sessionId, decision),
  getAppStatus: () => sourceStore.getStatus(),
  openTarget: (targetUrl) => openExternalTarget(targetUrl),
  jumpToAgentSession: async (sessionId) => {
    const session = sourceStore.getState().agent.sessions.find((item) => item.id === sessionId);
    logger.info('Received agent session jump request', {
      sessionId,
      found: Boolean(session),
      jumpTarget: session?.jumpTarget ?? null,
    });
    const didJump = await jumpToTerminalWindow(session?.jumpTarget);
    logger.info('Completed agent session jump request', {
      sessionId,
      didJump,
    });
    return didJump;
  },
  setOverlayExpanded: (expanded) => {
    overlayWindowMode = expanded ? 'expanded' : 'compact';
    logger.info('Received overlay mode change', {
      overlayWindowMode,
    });
    broadcastOverlayMode(overlayWindowMode);

    if (!overlayHost || overlayHost.isDestroyed()) {
      logger.warn('Cannot apply overlay mode change because host is unavailable');
      return overlayWindowMode;
    }

    return overlayHost.setMode(overlayWindowMode);
  },
  setExpandedContentHeight: (height) => {
    expandedContentHeight = Math.max(APP_CONFIG.window.compactHeight, Math.min(APP_CONFIG.window.expandedHeight, Math.round(height)));

    if (!overlayHost || overlayHost.isDestroyed()) {
      return;
    }

    overlayHost.setExpandedContentHeight(expandedContentHeight);
  },
};

function broadcastOverlayMode(mode: OverlayWindowMode): void {
  if (overlayHost && !overlayHost.isDestroyed()) {
    overlayHost.send(IPC_CHANNELS.APP.OVERLAY_MODE_CHANGED, mode);
  }

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }

    window.webContents.send(IPC_CHANNELS.APP.OVERLAY_MODE_CHANGED, mode);
  }
}

async function createApp(): Promise<void> {
  overlayWindowMode = 'compact';
  broadcastOverlayMode(overlayWindowMode);
  logger.info('Creating app overlay host');
  overlayHost = createOverlayHost(loadRenderer, overlayHostBridge, getOverlayRendererTarget());
  overlayHost.setExpandedContentHeight(expandedContentHeight);
  sourceStore.setOverlayHostKind(overlayHost.getStatus().active);

  try {
    logger.info('Loading overlay host');
    await overlayHost.load();
    logger.info('Showing overlay host inactive');
    overlayHost.showInactive();
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown overlay host startup failure');
    logger.error('Overlay host failed during startup', { message: normalizedError.message });

    overlayHost.destroy();
    overlayHost = createBrowserOverlayHost(loadRenderer, `Native macOS host startup failed: ${normalizedError.message}`);
    sourceStore.setOverlayHostKind(overlayHost.getStatus().active);
    logger.info('Retrying startup with browser overlay host fallback');
    await overlayHost.load();
    overlayHost.showInactive();
  }

  const hostStatus = overlayHost.getStatus();
  sourceStore.setOverlayHostKind(hostStatus.active);
  trayMenu.update(sourceStore.getStatus());
  logger.info('Overlay host ready', hostStatus);

  overlayHost.onClosed(() => {
    logger.warn('Overlay host window closed');
    overlayHost = null;
    overlayWindowMode = 'compact';
    broadcastOverlayMode(overlayWindowMode);
  });
}

async function refreshSources(): Promise<void> {
  try {
    sourcePoller.reload();
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown source refresh error');
    logger.error('Source refresh failed', { message: normalizedError.message });
  }
}

function wireStoreUpdates(): void {
  sourceStore.subscribe((state) => {
    trayMenu.update(sourceStore.getStatus());

    if (!overlayHost || overlayHost.isDestroyed()) {
      logger.warn('Skipping overlay update because host is unavailable');
      return;
    }

    overlayHost.send(IPC_CHANNELS.OVERLAY.UPDATED, state);
  });
}

app.whenReady().then(async () => {
  clearMacOsSavedState();
  logger.info('Electron app ready');
  registerOverlayHandlers(sourceStore);
  registerAgentHandlers(agentHookService);
  registerConfigHandlers(configService, sourcePoller);
  registerAppControlHandlers(sourceStore, {
    getOverlayMode: () => overlayWindowMode,
    setOverlayExpanded: (expanded) => overlayHostBridge.setOverlayExpanded(expanded),
    setExpandedContentHeight: (height) => overlayHostBridge.setExpandedContentHeight(height),
  });
  wireStoreUpdates();

  sourcePoller.start();
  await agentHookService.start();
  trayMenu.create(sourceStore.getStatus());
  await createApp();

  app.on('activate', async () => {
    logger.info('Electron app activate event received');
    if (overlayHost === null || overlayHost.isDestroyed()) {
      await createApp();
      return;
    }

    overlayHost.showInactive();
  });
}).catch((error: unknown) => {
  const normalizedError = error instanceof Error ? error : new Error('Unknown app startup failure');
  logger.error('Electron app failed during startup', { message: normalizedError.message });
});

app.on('before-quit', () => {
  logger.info('Electron app before-quit');
  agentHookService.stop();
  sourcePoller.stop();
});

app.on('window-all-closed', () => {
  logger.warn('Electron window-all-closed event received', {
    platform: process.platform,
  });
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
