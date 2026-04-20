import { BrowserWindow, screen } from 'electron';
import path from 'node:path';

import { APP_CONFIG } from '../../shared/constants/config';
import type { OverlayWindowMode } from '../../shared/types/ipc';

type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const WINDOW_MODE_ANIMATION_MS = APP_CONFIG.window.modeTransitionMs;
const windowAnimationTimers = new WeakMap<BrowserWindow, NodeJS.Timeout>();

function getOverlayBounds(mode: OverlayWindowMode): WindowBounds {
  const displayBounds = screen.getPrimaryDisplay().workArea;
  const width = mode === 'expanded' ? APP_CONFIG.window.expandedWidth : APP_CONFIG.window.compactWidth;
  const height = mode === 'expanded' ? APP_CONFIG.window.expandedHeight : APP_CONFIG.window.compactHeight;
  const x = Math.round(displayBounds.x + (displayBounds.width - width) / 2);
  const y = displayBounds.y + APP_CONFIG.window.topMargin;

  return { x, y, width, height };
}

function clearWindowAnimation(window: BrowserWindow): void {
  const activeTimer = windowAnimationTimers.get(window);

  if (!activeTimer) {
    return;
  }

  clearInterval(activeTimer);
  windowAnimationTimers.delete(window);
}

function easeInOutCubic(progress: number): number {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function interpolate(start: number, end: number, progress: number): number {
  return Math.round(start + (end - start) * progress);
}

function animateOverlayWindow(window: BrowserWindow, targetBounds: WindowBounds): void {
  clearWindowAnimation(window);

  if (window.isDestroyed()) {
    return;
  }

  const initialBounds = window.getBounds();
  const hasChanges =
    initialBounds.x !== targetBounds.x ||
    initialBounds.y !== targetBounds.y ||
    initialBounds.width !== targetBounds.width ||
    initialBounds.height !== targetBounds.height;

  if (!hasChanges) {
    return;
  }

  const startedAt = Date.now();
  const applyFrame = () => {
    if (window.isDestroyed()) {
      clearWindowAnimation(window);
      return;
    }

    const elapsed = Date.now() - startedAt;
    const linearProgress = Math.min(elapsed / WINDOW_MODE_ANIMATION_MS, 1);
    const easedProgress = easeInOutCubic(linearProgress);

    window.setBounds(
      {
        x: interpolate(initialBounds.x, targetBounds.x, easedProgress),
        y: interpolate(initialBounds.y, targetBounds.y, easedProgress),
        width: interpolate(initialBounds.width, targetBounds.width, easedProgress),
        height: interpolate(initialBounds.height, targetBounds.height, easedProgress),
      },
      false
    );

    if (linearProgress >= 1) {
      clearWindowAnimation(window);
    }
  };

  applyFrame();

  const timer = setInterval(() => {
    applyFrame();
  }, 1000 / 60);

  windowAnimationTimers.set(window, timer);
}

export function setOverlayWindowMode(window: BrowserWindow, mode: OverlayWindowMode): OverlayWindowMode {
  if (window.isDestroyed()) {
    return mode;
  }

  animateOverlayWindow(window, getOverlayBounds(mode));

  return mode;
}

export function createOverlayWindow(): BrowserWindow {
  const window = new BrowserWindow({
    ...getOverlayBounds('compact'),
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hiddenInMissionControl: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      sandbox: false,
    },
  });

  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setFullScreenable(false);

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  return window;
}
