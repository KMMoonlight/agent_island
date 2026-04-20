import { BrowserWindow, screen } from 'electron';
import path from 'node:path';

import { APP_CONFIG } from '../../shared/constants/config';
import type { OverlayHost, OverlayHostStatus, OverlayHostWindowMode } from './overlay-host';

export type WindowContentLoader = (window: BrowserWindow) => Promise<void>;

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type WindowAnimationSettings = {
  durationMs: number;
  easeSize: (progress: number) => number;
  lockTopEdge: boolean;
};

const windowAnimationTimers = new WeakMap<BrowserWindow, NodeJS.Timeout>();

export function getOverlayTop(display: Electron.Display, mode: OverlayHostWindowMode): number {
  const compactTop = display.workArea.y - APP_CONFIG.window.compactHeight + APP_CONFIG.window.compactTopMargin;

  if (mode === 'expanded') {
    return compactTop + APP_CONFIG.window.expandedTopMargin;
  }

  return compactTop;
}

export function getOverlayBounds(mode: OverlayHostWindowMode): WindowBounds {
  const display = screen.getPrimaryDisplay();
  const width = mode === 'expanded' ? APP_CONFIG.window.expandedWidth : APP_CONFIG.window.compactWidth;
  const height = mode === 'expanded' ? APP_CONFIG.window.expandedHeight : APP_CONFIG.window.compactHeight;
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2);
  const y = getOverlayTop(display, mode);

  return { x, y, width, height };
}

export function clearWindowAnimation(window: BrowserWindow): void {
  const activeTimer = windowAnimationTimers.get(window);

  if (!activeTimer) {
    return;
  }

  clearInterval(activeTimer);
  windowAnimationTimers.delete(window);
}

export function setWindowAnimationTimer(window: BrowserWindow, timer: NodeJS.Timeout): void {
  windowAnimationTimers.set(window, timer);
}

function applyWindowBounds(
  window: BrowserWindow,
  bounds: WindowBounds,
  options: { preserveY?: boolean } = {}
): void {
  if (options.preserveY) {
    const currentBounds = window.getBounds();

    window.setSize(bounds.width, bounds.height, false);
    window.setPosition(bounds.x, currentBounds.y, false);
    return;
  }

  window.setBounds(bounds, false);
  window.setPosition(bounds.x, bounds.y, false);
}

export function easeOutSoftBack(progress: number): number {
  const overshoot = 1.02;
  const coefficient = overshoot + 1;

  return 1 + coefficient * Math.pow(progress - 1, 3) + overshoot * Math.pow(progress - 1, 2);
}

export function easeInOutQuart(progress: number): number {
  return progress < 0.5
    ? 8 * Math.pow(progress, 4)
    : 1 - Math.pow(-2 * progress + 2, 4) / 2;
}

export function interpolate(start: number, end: number, progress: number): number {
  return Math.round(start + (end - start) * progress);
}

function getWindowAnimationSettings(mode: OverlayHostWindowMode): WindowAnimationSettings {
  return mode === 'expanded'
    ? {
        durationMs: APP_CONFIG.window.expandTransitionMs,
        easeSize: easeOutSoftBack,
        lockTopEdge: true,
      }
    : {
        durationMs: APP_CONFIG.window.collapseTransitionMs,
        easeSize: easeInOutQuart,
        lockTopEdge: true,
      };
}

function animateOverlayWindow(window: BrowserWindow, targetBounds: WindowBounds, mode: OverlayHostWindowMode): void {
  clearWindowAnimation(window);

  if (window.isDestroyed()) {
    return;
  }

  if (mode === 'expanded') {
    const compactBounds = getOverlayBounds('compact');
    const currentBounds = window.getBounds();

    if (currentBounds.y !== compactBounds.y) {
      applyWindowBounds(
        window,
        {
          x: currentBounds.x,
          y: compactBounds.y,
          width: currentBounds.width,
          height: currentBounds.height,
        },
        { preserveY: true }
      );
    }
  }

  const initialBounds = window.getBounds();
  const hasChanges =
    initialBounds.x !== targetBounds.x ||
    initialBounds.y !== targetBounds.y ||
    initialBounds.width !== targetBounds.width ||
    initialBounds.height !== targetBounds.height;

  if (!hasChanges) {
    applyWindowBounds(window, targetBounds, {
      preserveY: true,
    });
    return;
  }

  const animation = getWindowAnimationSettings(mode);
  const startedAt = Date.now();
  const lockedY = window.getBounds().y;
  let didLogFirstFrame = false;
  const applyFrame = () => {
    if (window.isDestroyed()) {
      clearWindowAnimation(window);
      return;
    }

    const elapsed = Date.now() - startedAt;
    const linearProgress = Math.min(elapsed / animation.durationMs, 1);
    const sizeProgress = animation.easeSize(linearProgress);
    const nextBounds = {
      x: interpolate(initialBounds.x, targetBounds.x, sizeProgress),
      y: animation.lockTopEdge ? lockedY : interpolate(initialBounds.y, targetBounds.y, sizeProgress),
      width: interpolate(initialBounds.width, targetBounds.width, sizeProgress),
      height: interpolate(initialBounds.height, targetBounds.height, sizeProgress),
    };

    applyWindowBounds(window, nextBounds, {
      preserveY: animation.lockTopEdge,
    });

    if (!didLogFirstFrame) {
      didLogFirstFrame = true;
    }

    if (linearProgress >= 1) {
      applyWindowBounds(window, targetBounds, {
        preserveY: animation.lockTopEdge,
      });
      clearWindowAnimation(window);
    }
  };

  applyFrame();

  const timer = setInterval(() => {
    applyFrame();
  }, 1000 / 60);

  setWindowAnimationTimer(window, timer);
}

export function createOverlayBrowserWindow(): BrowserWindow {
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

export function createBrowserOverlayHost(
  loadContent: WindowContentLoader,
  fallbackReason: string | null = null
): OverlayHost {
  const window = createOverlayBrowserWindow();
  const status: OverlayHostStatus = {
    active: 'browser-window',
    fallbackReason,
  };

  return {
    load: () => loadContent(window),
    showInactive: () => {
      window.showInactive();
    },
    onClosed: (callback) => {
      window.on('closed', callback);
    },
    isDestroyed: () => window.isDestroyed(),
    send: (channel, payload) => {
      window.webContents.send(channel, payload);
    },
    setMode: (mode) => {
      animateOverlayWindow(window, getOverlayBounds(mode), mode);
      return mode;
    },
    destroy: () => {
      clearWindowAnimation(window);
      window.destroy();
    },
    getStatus: () => status,
  };
}
