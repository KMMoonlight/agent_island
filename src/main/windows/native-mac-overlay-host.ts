import { screen } from 'electron';

import { APP_CONFIG } from '../../shared/constants/config';
import { logger as baseLogger } from '../services/logger';
import type {
  NativeOverlayBinding,
  NativeOverlayDisplay,
} from '../native/macos-overlay-binding';
import type {
  OverlayHost,
  OverlayHostBridge,
  OverlayHostStatus,
  OverlayHostWindowMode,
  OverlayRendererTarget,
} from './overlay-host';
import {
  easeInOutSmooth,
  easeOutSmoothSpring,
  interpolate,
} from './browser-overlay-host';
import { getHostOverlayBounds, type WindowBounds } from './overlay-geometry';

const logger = baseLogger.scope('native-overlay-host');

type NativeAnimationSettings = {
  durationMs: number;
  easing: (progress: number) => number;
  lockTopEdge: boolean;
};

type NativeHostEventMessage = {
  kind: 'event';
  channel: string;
  payload: unknown;
};

type NativeHostResponseMessage = {
  kind: 'response';
  requestId: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
};

type NativeHostInboundMessage =
  | {
      kind: 'request';
      requestId: string;
      channel: string;
      payload: unknown;
    }
  | {
      kind: 'event';
      channel: string;
      payload: unknown;
    };

type NativeOutboundMessage = NativeHostEventMessage | NativeHostResponseMessage;

function getNativeAnimation(mode: OverlayHostWindowMode): NativeAnimationSettings {
  return mode === 'expanded'
    ? {
        durationMs: APP_CONFIG.window.expandTransitionMs,
        easing: easeOutSmoothSpring,
        lockTopEdge: true,
      }
    : {
        durationMs: APP_CONFIG.window.collapseTransitionMs,
        easing: easeInOutSmooth,
        lockTopEdge: true,
      };
}

function getPrimaryDisplayMetadata(): NativeOverlayDisplay {
  const display = screen.getPrimaryDisplay();

  return {
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
    },
    workArea: {
      x: display.workArea.x,
      y: display.workArea.y,
      width: display.workArea.width,
      height: display.workArea.height,
    },
  };
}

function getNativeOverlayBounds(mode: OverlayHostWindowMode): WindowBounds {
  return getHostOverlayBounds(mode);
}

export function createNativeMacOverlayHost(
  binding: NativeOverlayBinding,
  bridge: OverlayHostBridge,
  rendererTarget: OverlayRendererTarget
): OverlayHost {
  const panelHandle = binding.createPanel();
  const status: OverlayHostStatus = {
    active: 'native-macos-panel',
    fallbackReason: null,
  };
  const closedCallbacks = new Set<() => void>();
  const pendingMessages: NativeOutboundMessage[] = [];
  let animationTimer: NodeJS.Timeout | null = null;
  let expandTimer: NodeJS.Timeout | null = null;
  let collapseTimer: NodeJS.Timeout | null = null;
  let isDestroyed = panelHandle === null;
  let isBridgeReady = false;
  let currentMode: OverlayHostWindowMode = 'compact';
  let expandedContentHeight: number = APP_CONFIG.window.expandedHeight;
  let isPointerInside = false;
  let suppressExpandUntilPointerLeaves = false;

  if (panelHandle === null) {
    throw new Error('Native NSPanel creation failed.');
  }

  const assertNativeCall = (result: boolean, action: string): void => {
    if (!result) {
      throw new Error(`Native overlay ${action} failed.`);
    }
  };

  const dispatchMessage = (message: NativeOutboundMessage): void => {
    if (isDestroyed) {
      return;
    }

    if (!isBridgeReady && !(message.kind === 'event' && message.channel === 'bridge-ready')) {
      pendingMessages.push(message);
      return;
    }

    binding.dispatchPanelMessage(panelHandle, JSON.stringify(message));
  };

  const flushPendingMessages = (): void => {
    if (!isBridgeReady || pendingMessages.length === 0) {
      return;
    }

    const queuedMessages = pendingMessages.splice(0, pendingMessages.length);
    for (const message of queuedMessages) {
      dispatchMessage(message);
    }
  };

  const applyBounds = (bounds: WindowBounds): void => {
    const display = getPrimaryDisplayMetadata();
    assertNativeCall(binding.setPanelFrame(panelHandle, bounds, display), 'setPanelFrame');
  };

  const getCurrentBounds = (): WindowBounds => {
    const display = getPrimaryDisplayMetadata();
    const nativeBounds = binding.getPanelFrame(panelHandle, display);
    const fallbackBounds = getNativeOverlayBounds('compact');

    return nativeBounds ?? fallbackBounds;
  };

  const ensureCompactAnchor = (): void => {
    const compactBounds = getNativeOverlayBounds('compact');
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

  const clearAnimation = (): void => {
    if (animationTimer === null) {
      return;
    }

    clearInterval(animationTimer);
    animationTimer = null;
  };

  const clearHoverTimer = (timer: NodeJS.Timeout | null): NodeJS.Timeout | null => {
    if (timer !== null) {
      clearTimeout(timer);
    }

    return null;
  };

  const scheduleModeChange = (mode: OverlayHostWindowMode): void => {
    if (mode === 'expanded') {
      collapseTimer = clearHoverTimer(collapseTimer);
      if (suppressExpandUntilPointerLeaves) {
        return;
      }
      if (currentMode === 'expanded' || expandTimer !== null) {
        return;
      }

      expandTimer = setTimeout(() => {
        expandTimer = null;
        bridge.setOverlayExpanded(true);
      }, APP_CONFIG.window.expandHoverDelayMs);
      return;
    }

    expandTimer = clearHoverTimer(expandTimer);
    if (currentMode === 'compact' || collapseTimer !== null) {
      return;
    }

    collapseTimer = setTimeout(() => {
      collapseTimer = null;
      bridge.setOverlayExpanded(false);
    }, APP_CONFIG.window.collapseHoverDelayMs);
  };

  const animatePanel = (mode: OverlayHostWindowMode): void => {
    clearAnimation();

    if (isDestroyed) {
      return;
    }

    if (mode === 'expanded') {
      ensureCompactAnchor();
    }

    const targetBounds = getHostOverlayBounds(mode, expandedContentHeight);
    const initialBounds = getCurrentBounds();
    const hasChanges =
      initialBounds.x !== targetBounds.x ||
      initialBounds.y !== targetBounds.y ||
      initialBounds.width !== targetBounds.width ||
      initialBounds.height !== targetBounds.height;

    if (!hasChanges) {
      applyBounds(targetBounds);
      return;
    }

    const animation = getNativeAnimation(mode);
    const lockedY = initialBounds.y;
    const startedAt = Date.now();

    const applyFrame = (): void => {
      if (isDestroyed) {
        clearAnimation();
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

      if (linearProgress >= 1) {
        applyBounds({
          ...targetBounds,
          y: animation.lockTopEdge ? lockedY : targetBounds.y,
        });
        clearAnimation();
      }
    };

    applyFrame();
    animationTimer = setInterval(applyFrame, 1000 / 60);
  };

  const sendResponse = (requestId: string, payload: unknown, ok = true, error?: string): void => {
    dispatchMessage({
      kind: 'response',
      requestId,
      ok,
      payload,
      error,
    });
  };

  const handleRequest = async (message: Extract<NativeHostInboundMessage, { kind: 'request' }>): Promise<void> => {
    try {
      switch (message.channel) {
        case 'overlay:get-state': {
          sendResponse(message.requestId, bridge.getOverlayState());
          return;
        }
        case 'config:get': {
          sendResponse(message.requestId, bridge.getConfig());
          return;
        }
        case 'config:save': {
          const nextConfig = await bridge.saveConfig(message.payload as never);
          sendResponse(message.requestId, nextConfig);
          return;
        }
        case 'config:validate': {
          sendResponse(message.requestId, bridge.validateConfig(message.payload));
          return;
        }
        case 'config:refresh-sources': {
          const state = await bridge.refreshSources();
          sendResponse(message.requestId, state);
          return;
        }
        case 'agent:get-setup': {
          sendResponse(message.requestId, bridge.getAgentSetup());
          return;
        }
        case 'agent:resolve-approval': {
          const payload =
            typeof message.payload === 'object' && message.payload !== null
              ? message.payload as { sessionId?: unknown; decision?: unknown }
              : null;

          if (
            typeof payload?.sessionId !== 'string'
            || (payload.decision !== 'deny' && payload.decision !== 'allow-once' && payload.decision !== 'allow-always')
          ) {
            sendResponse(message.requestId, false);
            return;
          }

          const didResolve = await bridge.resolveAgentApproval(payload.sessionId, payload.decision);
          sendResponse(message.requestId, didResolve);
          return;
        }
        case 'app:get-status': {
          sendResponse(message.requestId, bridge.getAppStatus());
          return;
        }
        case 'app:open-target': {
          if (typeof message.payload !== 'string') {
            sendResponse(message.requestId, false);
            return;
          }

          const didOpen = await bridge.openTarget(message.payload);
          sendResponse(message.requestId, didOpen);
          return;
        }
        case 'app:jump-to-agent-session': {
          if (typeof message.payload !== 'string') {
            sendResponse(message.requestId, false);
            return;
          }

          const didJump = await bridge.jumpToAgentSession(message.payload);
          sendResponse(message.requestId, didJump);
          return;
        }
        case 'app:set-overlay-expanded': {
          const nextMode = bridge.setOverlayExpanded(Boolean(message.payload));
          sendResponse(message.requestId, nextMode);
          return;
        }
        case 'app:set-expanded-content-height': {
          if (typeof message.payload !== 'number' || !Number.isFinite(message.payload)) {
            sendResponse(message.requestId, null);
            return;
          }

          bridge.setExpandedContentHeight(message.payload);
          sendResponse(message.requestId, null);
          return;
        }
        default: {
          sendResponse(message.requestId, null, false, `Unknown channel: ${message.channel}`);
        }
      }
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('Unknown native host bridge error');
      logger.error('Native host request failed', {
        channel: message.channel,
        requestId: message.requestId,
        message: normalizedError.message,
      });
      sendResponse(message.requestId, null, false, normalizedError.message);
    }
  };

  const destroyResources = (): void => {
    if (isDestroyed) {
      return;
    }

    isDestroyed = true;
    expandTimer = clearHoverTimer(expandTimer);
    collapseTimer = clearHoverTimer(collapseTimer);
    clearAnimation();
    binding.orderPanelOut(panelHandle);
    binding.destroyPanel(panelHandle);
  };

  assertNativeCall(
    binding.setPanelMessageCallback(panelHandle, (messageJson: string) => {
      let message: NativeHostInboundMessage;

      try {
        message = JSON.parse(messageJson) as NativeHostInboundMessage;
      } catch {
        return;
      }

      if (message.kind === 'event' && message.channel === 'bridge-ready') {
        isBridgeReady = true;
        dispatchMessage({
          kind: 'event',
          channel: 'bridge-ready',
          payload: {
            rendererTarget,
          },
        });
        flushPendingMessages();
        return;
      }

      if (message.kind === 'event' && message.channel === 'native:hover') {
        const inside =
          typeof message.payload === 'object' &&
          message.payload !== null &&
          'inside' in message.payload &&
          typeof (message.payload as { inside: unknown }).inside === 'boolean'
            ? (message.payload as { inside: boolean }).inside
            : false;

        isPointerInside = inside;
        if (!inside) {
          suppressExpandUntilPointerLeaves = false;
        }
        scheduleModeChange(inside ? 'expanded' : 'compact');
        return;
      }

      if (message.kind === 'request') {
        void handleRequest(message);
      }
    }),
    'setPanelMessageCallback'
  );

  return {
    load: async () => {
      if (rendererTarget.kind === 'url') {
        assertNativeCall(binding.loadPanelUrl(panelHandle, rendererTarget.value), 'loadPanelUrl');
      } else {
        assertNativeCall(binding.loadPanelFile(panelHandle, rendererTarget.value), 'loadPanelFile');
      }

      applyBounds(getNativeOverlayBounds('compact'));
    },
    showInactive: () => {
      assertNativeCall(binding.orderPanelFrontRegardless(panelHandle), 'orderPanelFrontRegardless');
    },
    onClosed: (callback) => {
      closedCallbacks.add(callback);
    },
    isDestroyed: () => isDestroyed,
    send: (channel, payload) => {
      dispatchMessage({
        kind: 'event',
        channel,
        payload,
      });
    },
    setMode: (mode) => {
      if (mode === 'compact' && isPointerInside) {
        suppressExpandUntilPointerLeaves = true;
      }
      currentMode = mode;
      animatePanel(mode);
      return mode;
    },
    setExpandedContentHeight: (height) => {
      if (!Number.isFinite(height)) {
        return;
      }

      expandedContentHeight = Math.max(APP_CONFIG.window.compactHeight, Math.min(APP_CONFIG.window.expandedHeight, Math.round(height)));

      if (currentMode === 'expanded') {
        animatePanel('expanded');
      }
    },
    destroy: () => {
      destroyResources();
      closedCallbacks.forEach((callback) => {
        callback();
      });
      closedCallbacks.clear();
    },
    getStatus: () => status,
  };
}
