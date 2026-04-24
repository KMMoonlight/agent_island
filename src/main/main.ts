import './env-setup';

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow } from 'electron';

import { IPC_CHANNELS } from '../shared/constants/channels';
import { APP_CONFIG } from '../shared/constants/config';
import { formatFocusTimerRuntimeLabel, type FocusTimerConfigOption } from '../shared/types/config';
import type { OverlayWindowMode } from '../shared/types/ipc';
import type { ActiveFocusTimer, CompletedFocusTimer } from '../shared/types/source-data';
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
const mainModuleDirectory = path.dirname(fileURLToPath(import.meta.url));
const configService = new ConfigService();
const sourceStore = new SourceStore();
const sourcePoller = new SourcePoller(configService, sourceStore);
const agentHookService = new AgentHookService(sourceStore);
const trayMenu = new TrayMenu({
  onOpenConfig: () => {
    void createConfigWindow(getOverlayRendererTarget());
  },
  onStartFocusTimer: (option) => {
    startFocusTimer(option);
  },
});

let overlayHost: OverlayHost | null = null;
let overlayWindowMode: OverlayWindowMode = 'compact';
let expandedContentHeight: number = APP_CONFIG.window.expandedHeight;
let reminderHoldActive = false;
let focusTimerEndTimeout: ReturnType<typeof setTimeout> | null = null;
let focusTimerCompletionClearTimeout: ReturnType<typeof setTimeout> | null = null;
const FOCUS_TIMER_COMPLETION_VISIBLE_MS = 12_000;

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
  if (app.isPackaged) {
    return {
      kind: 'file',
      value: path.join(process.resourcesPath, 'app.asar.unpacked/out/renderer/index.html'),
    };
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    return {
      kind: 'url',
      value: process.env.ELECTRON_RENDERER_URL,
    };
  }

  return {
    kind: 'file',
    value: path.join(mainModuleDirectory, '../renderer/index.html'),
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
  answerAgentQuestion: (sessionId, response) => agentHookService.answerPendingQuestion(sessionId, response),
  handoffPendingApproval: (sessionId) => agentHookService.handoffPendingApproval(sessionId),
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
  setOverlayExpanded: (expanded, options) => {
    overlayWindowMode = expanded ? 'expanded' : 'compact';
    logger.info('Received overlay mode change', {
      overlayWindowMode,
      options: options ?? null,
    });
    broadcastOverlayMode(overlayWindowMode);

    if (!overlayHost || overlayHost.isDestroyed()) {
      logger.warn('Cannot apply overlay mode change because host is unavailable');
      return overlayWindowMode;
    }

    return overlayHost.setMode(overlayWindowMode, options);
  },
  setExpandedContentHeight: (height) => {
    expandedContentHeight = Math.max(APP_CONFIG.window.compactHeight, Math.min(APP_CONFIG.window.expandedHeight, Math.round(height)));

    if (!overlayHost || overlayHost.isDestroyed()) {
      return;
    }

    overlayHost.setExpandedContentHeight(expandedContentHeight);
  },
  setReminderHoldActive: (active) => {
    reminderHoldActive = active;
  },
  dismissFocusTimerCompletion: () => {
    dismissFocusTimerCompletion();
  },
  isReminderHoldActive: () => reminderHoldActive,
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

function getFocusTimerOptions(): FocusTimerConfigOption[] {
  try {
    return configService.getConfig().focusTimers.options;
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown focus timer config error');
    logger.warn('Failed to read focus timer options for tray menu', {
      message: normalizedError.message,
    });
    return [];
  }
}

function updateTrayMenu(): void {
  trayMenu.update(sourceStore.getStatus(), getFocusTimerOptions(), sourceStore.getState().focusTimer.active);
}

function clearFocusTimerEndTimeout(): void {
  if (focusTimerEndTimeout === null) {
    return;
  }

  clearTimeout(focusTimerEndTimeout);
  focusTimerEndTimeout = null;
}

function clearFocusTimerCompletionTimeout(): void {
  if (focusTimerCompletionClearTimeout === null) {
    return;
  }

  clearTimeout(focusTimerCompletionClearTimeout);
  focusTimerCompletionClearTimeout = null;
}

function startFocusTimer(option: FocusTimerConfigOption): void {
  clearFocusTimerEndTimeout();
  clearFocusTimerCompletionTimeout();

  const durationMs = option.durationMinutes * 60_000;
  const startedAtMs = Date.now();
  const activeFocusTimer: ActiveFocusTimer = {
    id: `${option.id}-${startedAtMs}`,
    optionId: option.id,
    label: formatFocusTimerRuntimeLabel(option),
    durationMs,
    startedAtMs,
    endsAtMs: startedAtMs + durationMs,
  };

  logger.info('Starting focus timer', {
    optionId: option.id,
    durationMinutes: option.durationMinutes,
  });

  sourceStore.setFocusTimer(activeFocusTimer);
  updateTrayMenu();

  focusTimerEndTimeout = setTimeout(() => {
    focusTimerEndTimeout = null;
    const completedAtMs = Date.now();
    const completedFocusTimer: CompletedFocusTimer = {
      id: `${activeFocusTimer.id}:completed`,
      optionId: activeFocusTimer.optionId,
      label: activeFocusTimer.label,
      durationMs: activeFocusTimer.durationMs,
      completedAtMs,
      expiresAtMs: completedAtMs + FOCUS_TIMER_COMPLETION_VISIBLE_MS,
    };

    sourceStore.setCompletedFocusTimer(completedFocusTimer);
    updateTrayMenu();

    focusTimerCompletionClearTimeout = setTimeout(() => {
      focusTimerCompletionClearTimeout = null;
      sourceStore.setCompletedFocusTimer(null);
      updateTrayMenu();
    }, FOCUS_TIMER_COMPLETION_VISIBLE_MS);
  }, durationMs);
}

function dismissFocusTimerCompletion(): void {
  clearFocusTimerCompletionTimeout();
  sourceStore.setCompletedFocusTimer(null);
  updateTrayMenu();
}

async function createApp(): Promise<void> {
  overlayWindowMode = 'compact';
  broadcastOverlayMode(overlayWindowMode);
  logger.info('Creating app overlay host');
  overlayHost = createOverlayHost(loadRenderer, overlayHostBridge, getOverlayRendererTarget());
  overlayHost.setIslandWidthPreset(sourceStore.getState().islandWidthPreset);
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
    overlayHost.setIslandWidthPreset(sourceStore.getState().islandWidthPreset);
    sourceStore.setOverlayHostKind(overlayHost.getStatus().active);
    logger.info('Retrying startup with browser overlay host fallback');
    await overlayHost.load();
    overlayHost.showInactive();
  }

  const hostStatus = overlayHost.getStatus();
  sourceStore.setOverlayHostKind(hostStatus.active);
  updateTrayMenu();
  logger.info('Overlay host ready', hostStatus);

  overlayHost.onClosed(() => {
    logger.warn('Overlay host window closed');
    overlayHost = null;
    overlayWindowMode = 'compact';
    broadcastOverlayMode(overlayWindowMode);
  });
}

function wireStoreUpdates(): void {
  sourceStore.subscribe((state) => {
    updateTrayMenu();

    if (!overlayHost || overlayHost.isDestroyed()) {
      logger.warn('Skipping overlay update because host is unavailable');
      return;
    }

    overlayHost.setIslandWidthPreset(state.islandWidthPreset);
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
    setOverlayExpanded: (expanded, options) => overlayHostBridge.setOverlayExpanded(expanded, options),
    setExpandedContentHeight: (height) => overlayHostBridge.setExpandedContentHeight(height),
    setReminderHoldActive: (active) => overlayHostBridge.setReminderHoldActive(active),
    dismissFocusTimerCompletion: () => overlayHostBridge.dismissFocusTimerCompletion(),
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
  clearFocusTimerEndTimeout();
  clearFocusTimerCompletionTimeout();
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
