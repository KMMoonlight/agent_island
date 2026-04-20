import { screen } from 'electron';

import { APP_CONFIG } from '../../shared/constants/config';
import type { NativeOverlayBinding } from '../native/macos-overlay-binding';
import type { OverlayHost, OverlayHostStatus, OverlayHostWindowMode } from './overlay-host';
import {
  clearWindowAnimation,
  createOverlayBrowserWindow,
  easeInOutQuart,
  easeOutSoftBack,
  getOverlayBounds,
  interpolate,
  setWindowAnimationTimer,
  type WindowBounds,
  type WindowContentLoader,
} from './browser-overlay-host';

function getNativeAnimation(mode: OverlayHostWindowMode): {
  durationMs: number;
  easing: (progress: number) => number;
  lockTopEdge: boolean;
} {
  return mode === 'expanded'
    ? {
        durationMs: APP_CONFIG.window.expandTransitionMs,
        easing: easeOutSoftBack,
        lockTopEdge: true,
      }
    : {
        durationMs: APP_CONFIG.window.collapseTransitionMs,
        easing: easeInOutQuart,
        lockTopEdge: true,
      };
}

export function createNativeMacOverlayHost(
  loadContent: WindowContentLoader,
  binding: NativeOverlayBinding
): OverlayHost {
  const window = createOverlayBrowserWindow();
  const nativeHandle = window.getNativeWindowHandle();
  const status: OverlayHostStatus = {
    active: 'native-macos-panel',
    fallbackReason: null,
  };

  const applyBounds = (bounds: WindowBounds): void => {
    binding.setFrame(nativeHandle, bounds);
  };

  const getCurrentBounds = (): WindowBounds => {
    return binding.getFrame(nativeHandle) ?? getOverlayBounds('compact');
  };

  const ensureCompactAnchor = (): void => {
    const compactBounds = getOverlayBounds('compact');
    const currentBounds = getCurrentBounds();

    if (currentBounds.y === compactBounds.y) {
      return;
    }

    applyBounds({
      x: currentBounds.x,
      y: compactBounds.y,
      width: currentBounds.width,
      height: currentBounds.height,
    });
  };

  const animateOverlayWindow = (mode: OverlayHostWindowMode): void => {
    clearWindowAnimation(window);

    if (window.isDestroyed()) {
      return;
    }

    if (mode === 'expanded') {
      ensureCompactAnchor();
    }

    const targetBounds = getOverlayBounds(mode);
    const initialBounds = getCurrentBounds();
    const hasChanges =
      initialBounds.x !== targetBounds.x ||
      initialBounds.y !== targetBounds.y ||
      initialBounds.width !== targetBounds.width ||
      initialBounds.height !== targetBounds.height;

    console.info('[overlay-window]', {
      stage: 'native:animate:start',
      mode,
      initialBounds,
      targetBounds,
      displayFrame: screen.getPrimaryDisplay().bounds,
      displayWorkArea: screen.getPrimaryDisplay().workArea,
    });

    if (!hasChanges) {
      applyBounds(targetBounds);
      console.info('[overlay-window]', {
        stage: 'native:animate:no-change',
        mode,
        targetBounds,
      });
      return;
    }

    const animation = getNativeAnimation(mode);
    const lockedY = initialBounds.y;
    const startedAt = Date.now();
    let didLogFirstFrame = false;

    const applyFrame = (): void => {
      if (window.isDestroyed()) {
        clearWindowAnimation(window);
        return;
      }

      const elapsed = Date.now() - startedAt;
      const linearProgress = Math.min(elapsed / animation.durationMs, 1);
      const easedProgress = animation.easing(linearProgress);
      const nextBounds = {
        x: interpolate(initialBounds.x, targetBounds.x, easedProgress),
        y: animation.lockTopEdge ? lockedY : interpolate(initialBounds.y, targetBounds.y, easedProgress),
        width: interpolate(initialBounds.width, targetBounds.width, easedProgress),
        height: interpolate(initialBounds.height, targetBounds.height, easedProgress),
      };

      applyBounds(nextBounds);

      if (!didLogFirstFrame) {
        didLogFirstFrame = true;
        console.info('[overlay-window]', {
          stage: 'native:animate:first-frame',
          mode,
          linearProgress,
          easedProgress,
          nextBounds,
          targetBounds,
        });
      }

      if (linearProgress >= 1) {
        applyBounds({
          ...targetBounds,
          y: animation.lockTopEdge ? lockedY : targetBounds.y,
        });
        console.info('[overlay-window]', {
          stage: 'native:animate:end',
          mode,
          linearProgress,
          easedProgress,
          finalBounds: binding.getFrame(nativeHandle),
          targetBounds,
        });
        clearWindowAnimation(window);
      }
    };

    applyFrame();
    const timer = setInterval(applyFrame, 1000 / 60);
    setWindowAnimationTimer(window, timer);
  };

  return {
    load: async () => {
      await loadContent(window);
      binding.configureWindow(nativeHandle);
      applyBounds(getOverlayBounds('compact'));
    },
    showInactive: () => {
      binding.orderFrontRegardless(nativeHandle);
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
      animateOverlayWindow(mode);
      return mode;
    },
    destroy: () => {
      clearWindowAnimation(window);
      window.destroy();
    },
    getStatus: () => status,
  };
}
