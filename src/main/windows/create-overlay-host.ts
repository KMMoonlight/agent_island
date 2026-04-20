import type { OverlayHost } from './overlay-host';
import { createBrowserOverlayHost, type WindowContentLoader } from './browser-overlay-host';
import { getNativeOverlayBinding, getNativeOverlayUnavailableReason } from '../native/macos-overlay-binding';
import { createNativeMacOverlayHost } from './native-mac-overlay-host';

export function createOverlayHost(loadContent: WindowContentLoader): OverlayHost {
  const forcedBrowserHost = process.env.AGENT_ISLAND_USE_BROWSER_HOST === '1';
  const enableNativeHost = process.env.AGENT_ISLAND_USE_NATIVE_HOST === '1';

  if (forcedBrowserHost) {
    return createBrowserOverlayHost(loadContent, 'Forced BrowserWindow host via AGENT_ISLAND_USE_BROWSER_HOST=1');
  }

  if (!enableNativeHost) {
    return createBrowserOverlayHost(loadContent, 'Native macOS host is currently opt-in via AGENT_ISLAND_USE_NATIVE_HOST=1.');
  }

  const nativeBinding = getNativeOverlayBinding();

  if (!nativeBinding) {
    return createBrowserOverlayHost(loadContent, getNativeOverlayUnavailableReason());
  }

  if (!nativeBinding.isSupported()) {
    return createBrowserOverlayHost(loadContent, nativeBinding.getUnavailableReason());
  }

  return createNativeMacOverlayHost(loadContent, nativeBinding);
}
