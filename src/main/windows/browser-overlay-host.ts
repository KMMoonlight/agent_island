import { BrowserWindow } from 'electron';
import path from 'node:path';

import { APP_CONFIG } from '../../shared/constants/config';
import type { OverlayHost, OverlayHostStatus, OverlayHostWindowMode } from './overlay-host';
import { createBrowserWindowContentHost, type OverlayContentHost } from './overlay-content-host';
import { getHostOverlayBounds, type WindowBounds } from './overlay-geometry';

export type WindowContentLoader = (contentHost: OverlayContentHost) => Promise<void>;

type WindowAnimationSettings = {
  durationMs: number;
  easeSize: (progress: number) => number;
  easePosition: (progress: number) => number;
  lockTopEdge: boolean;
  positionStartProgress: number;
};

const windowAnimationTimers = new WeakMap<BrowserWindow, NodeJS.Timeout>();

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

function normalizeWindowBounds(bounds: WindowBounds): WindowBounds {
  const sanitize = (value: number, fallback: number): number => {
    if (!Number.isFinite(value)) {
      return fallback;
    }

    return Math.round(value);
  };

  return {
    x: sanitize(bounds.x, 0),
    y: sanitize(bounds.y, 0),
    width: Math.max(1, sanitize(bounds.width, APP_CONFIG.window.compactWidth)),
    height: Math.max(1, sanitize(bounds.height, APP_CONFIG.window.compactHeight)),
  };
}

function applyWindowBounds(
  window: BrowserWindow,
  bounds: WindowBounds,
  options: { preserveY?: boolean } = {}
): void {
  const normalizedBounds = normalizeWindowBounds(bounds);

  if (options.preserveY) {
    const currentBounds = window.getBounds();

    window.setSize(normalizedBounds.width, normalizedBounds.height, false);
    window.setPosition(normalizedBounds.x, currentBounds.y, false);
    return;
  }

  window.setBounds(normalizedBounds, false);
}

export function easeOutSmoothSpring(progress: number): number {
  const damping = 5.2;
  const angularFrequency = 7.6;
  const value = 1 - Math.exp(-damping * progress) * Math.cos(angularFrequency * progress);

  return Math.min(1, value);
}

export function easeOutSmooth(progress: number): number {
  return 1 - Math.pow(1 - progress, 4);
}

export function easeInOutSmooth(progress: number): number {
  return progress * progress * (3 - 2 * progress);
}

export function easeInOutSoft(progress: number): number {
  if (progress < 0.5) {
    return 8 * progress * progress * progress * progress;
  }

  return 1 - Math.pow(-2 * progress + 2, 4) / 2;
}

export function interpolate(start: number, end: number, progress: number): number {
  return Math.round(start + (end - start) * progress);
}

function getWindowAnimationSettings(mode: OverlayHostWindowMode): WindowAnimationSettings {
  return mode === 'expanded'
    ? {
        durationMs: APP_CONFIG.window.expandTransitionMs,
        easeSize: easeOutSmooth,
        easePosition: easeInOutSmooth,
        lockTopEdge: true,
        positionStartProgress: 0.76,
      }
    : {
        durationMs: APP_CONFIG.window.collapseTransitionMs,
        easeSize: easeInOutSoft,
        easePosition: easeInOutSmooth,
        lockTopEdge: true,
        positionStartProgress: 0.58,
      };
}

function animateOverlayWindow(window: BrowserWindow, targetBounds: WindowBounds, mode: OverlayHostWindowMode): void {
  clearWindowAnimation(window);

  if (window.isDestroyed()) {
    return;
  }

  if (mode === 'expanded') {
      const compactBounds = getHostOverlayBounds('compact');
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
  const applyFrame = () => {
    if (window.isDestroyed()) {
      clearWindowAnimation(window);
      return;
    }

    const elapsed = Date.now() - startedAt;
    const linearProgress = Math.min(elapsed / animation.durationMs, 1);
    const sizeProgress = animation.easeSize(linearProgress);
    const shouldSettleY = animation.lockTopEdge && lockedY !== targetBounds.y;
    const normalizedPositionProgress = shouldSettleY
      ? Math.max(0, (linearProgress - animation.positionStartProgress) / (1 - animation.positionStartProgress))
      : 1;
    const positionProgress = shouldSettleY ? animation.easePosition(normalizedPositionProgress) : sizeProgress;
    const nextBounds = {
      x: interpolate(initialBounds.x, targetBounds.x, sizeProgress),
      y: animation.lockTopEdge ? interpolate(lockedY, targetBounds.y, positionProgress) : interpolate(initialBounds.y, targetBounds.y, sizeProgress),
      width: interpolate(initialBounds.width, targetBounds.width, sizeProgress),
      height: interpolate(initialBounds.height, targetBounds.height, sizeProgress),
    };

    applyWindowBounds(window, nextBounds);

    if (linearProgress >= 1) {
      applyWindowBounds(window, targetBounds);
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
    ...getHostOverlayBounds('compact'),
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
  let expandedContentHeight: number = APP_CONFIG.window.expandedHeight;
  let currentMode: OverlayHostWindowMode = 'compact';

  const contentHost = createBrowserWindowContentHost(window);

  return {
    load: () => loadContent(contentHost),
    showInactive: () => {
      window.showInactive();
    },
    onClosed: (callback) => {
      window.on('closed', callback);
    },
    isDestroyed: () => window.isDestroyed(),
    send: (channel, payload) => {
      contentHost.send(channel, payload);
    },
    setMode: (mode) => {
      currentMode = mode;
      animateOverlayWindow(window, getHostOverlayBounds(mode, expandedContentHeight), mode);
      return mode;
    },
    setExpandedContentHeight: (height) => {
      if (!Number.isFinite(height)) {
        return;
      }

      expandedContentHeight = Math.max(APP_CONFIG.window.compactHeight, Math.min(APP_CONFIG.window.expandedHeight, Math.round(height)));

      if (currentMode === 'expanded') {
        animateOverlayWindow(window, getHostOverlayBounds('expanded', expandedContentHeight), 'expanded');
      }
    },
    destroy: () => {
      clearWindowAnimation(window);
      window.destroy();
    },
    getStatus: () => status,
  };
}
