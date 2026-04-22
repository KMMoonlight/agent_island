import { logger as baseLogger } from '../services/logger';
import { getNativeOverlayBinding, getNativeOverlayUnavailableReason } from '../native/macos-overlay-binding';
import { createBrowserOverlayHost, type WindowContentLoader } from './browser-overlay-host';
import { createNativeMacOverlayHost } from './native-mac-overlay-host';
import type { OverlayHost, OverlayHostBridge, OverlayRendererTarget } from './overlay-host';

const logger = baseLogger.scope('overlay-host-factory');

function resolveOverlayHostPreference(): 'browser' | 'native' | 'automatic' {
  if (process.env.AGENT_ISLAND_USE_BROWSER_HOST === '1') {
    return 'browser';
  }

  if (process.env.AGENT_ISLAND_USE_NATIVE_HOST === '1') {
    return 'native';
  }

  return 'automatic';
}

export function createOverlayHost(
  loadContent: WindowContentLoader,
  bridge: OverlayHostBridge,
  rendererTarget: OverlayRendererTarget
): OverlayHost {
  const hostPreference = resolveOverlayHostPreference();
  const shouldUseNativeHost = hostPreference === 'native' || (hostPreference === 'automatic' && process.platform === 'darwin');

  logger.info('Selecting overlay host', {
    platform: process.platform,
    hostPreference,
    shouldUseNativeHost,
  });

  if (hostPreference === 'browser') {
    logger.info('Using browser overlay host because browser host was forced');
    return createBrowserOverlayHost(loadContent, 'Forced BrowserWindow host via AGENT_ISLAND_USE_BROWSER_HOST=1');
  }

  if (!shouldUseNativeHost) {
    logger.info('Using browser overlay host because current platform is not darwin');
    return createBrowserOverlayHost(loadContent, 'Native macOS host is only enabled automatically on darwin.');
  }

  const nativeBinding = getNativeOverlayBinding();

  if (!nativeBinding) {
    const fallbackReason = getNativeOverlayUnavailableReason();
    logger.error('Native overlay binding unavailable; falling back to browser host', {
      fallbackReason,
      hostPreference,
    });
    return createBrowserOverlayHost(loadContent, fallbackReason);
  }

  logger.info('Using native macOS overlay host');
  return createNativeMacOverlayHost(nativeBinding, bridge, rendererTarget);
}
