import path from 'node:path';

import { logger as baseLogger } from '../services/logger';

const nativeOverlayBindingPath = path.join(__dirname, 'native/macos-overlay-panel/index.cjs');
const logger = baseLogger.scope('native-overlay-binding');

export type NativeOverlayPanelHandle = Buffer;

export type NativeOverlayFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NativeOverlayDisplay = {
  bounds: NativeOverlayFrame;
  workArea: NativeOverlayFrame;
};

export type NativeOverlayDiagnostics = {
  frame: NativeOverlayFrame | null;
  visible: boolean;
  occluded: boolean;
  level: number;
  screenFrame: NativeOverlayFrame | null;
  screenVisibleFrame: NativeOverlayFrame | null;
  collectionBehavior: number;
  webViewLoaded: boolean;
  bridgeReady: boolean;
  contentViewFrame: NativeOverlayFrame | null;
  currentUrl: string | null;
};

export type NativeOverlayBinding = {
  isSupported: () => boolean;
  getUnavailableReason: () => string | null;
  getLoadDiagnostics: () => string | null;
  createPanel: () => NativeOverlayPanelHandle | null;
  destroyPanel: (panelHandle: NativeOverlayPanelHandle) => boolean;
  loadPanelUrl: (panelHandle: NativeOverlayPanelHandle, url: string) => boolean;
  loadPanelFile: (panelHandle: NativeOverlayPanelHandle, filePath: string) => boolean;
  setPanelMessageCallback: (panelHandle: NativeOverlayPanelHandle, callback: (messageJson: string) => void) => boolean;
  dispatchPanelMessage: (panelHandle: NativeOverlayPanelHandle, messageJson: string) => boolean;
  setPanelFrame: (panelHandle: NativeOverlayPanelHandle, frame: NativeOverlayFrame, display?: NativeOverlayDisplay) => boolean;
  getPanelFrame: (panelHandle: NativeOverlayPanelHandle, display?: NativeOverlayDisplay) => NativeOverlayFrame | null;
  getPanelDiagnostics: (panelHandle: NativeOverlayPanelHandle, display?: NativeOverlayDisplay) => NativeOverlayDiagnostics | null;
  orderPanelFrontRegardless: (panelHandle: NativeOverlayPanelHandle) => boolean;
  orderPanelOut: (panelHandle: NativeOverlayPanelHandle) => boolean;
};

let cachedBinding: NativeOverlayBinding | null = null;
let cachedReason: string | null = null;

export function getNativeOverlayBinding(): NativeOverlayBinding | null {
  if (cachedBinding !== null) {
    logger.info('Reusing cached native overlay binding');
    return cachedBinding;
  }

  if (process.platform !== 'darwin') {
    cachedReason = 'Native macOS overlay is only available on darwin.';
    logger.info('Skipping native overlay binding load on unsupported platform', {
      platform: process.platform,
    });
    return null;
  }

  logger.info('Loading native overlay binding', {
    bindingPath: nativeOverlayBindingPath,
  });

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const binding = require(nativeOverlayBindingPath) as NativeOverlayBinding;
    const loadDiagnostics = binding.getLoadDiagnostics?.() ?? null;

    logger.info('Native overlay binding module loaded', {
      loadDiagnostics,
    });

    if (!binding.isSupported()) {
      cachedReason = loadDiagnostics ?? binding.getUnavailableReason() ?? 'Native macOS overlay bridge is unavailable.';
      logger.error('Native overlay binding reported unsupported', {
        cachedReason,
      });
      return null;
    }

    cachedBinding = binding;
    cachedReason = null;
    logger.info('Native overlay binding ready');
    return cachedBinding;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown addon load failure';
    cachedReason = `Native macOS overlay unavailable: ${message}`;
    logger.error('Native overlay binding load failed', {
      message,
      bindingPath: nativeOverlayBindingPath,
    });
    return null;
  }
}

export function getNativeOverlayUnavailableReason(): string | null {
  if (cachedBinding !== null) {
    return null;
  }

  if (cachedReason !== null) {
    return cachedReason;
  }

  getNativeOverlayBinding();
  return cachedReason;
}
