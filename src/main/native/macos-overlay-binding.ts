import path from 'node:path';

const nativeOverlayBindingPath = path.join(__dirname, 'native/macos-overlay-panel/index.cjs');

export type NativeOverlayFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NativeOverlayBinding = {
  isSupported: () => boolean;
  getUnavailableReason: () => string | null;
  configureWindow: (nativeHandle: Buffer) => boolean;
  setFrame: (nativeHandle: Buffer, frame: NativeOverlayFrame) => boolean;
  getFrame: (nativeHandle: Buffer) => NativeOverlayFrame | null;
  orderFrontRegardless: (nativeHandle: Buffer) => boolean;
};

let cachedBinding: NativeOverlayBinding | null = null;
let cachedReason: string | null = null;

export function getNativeOverlayBinding(): NativeOverlayBinding | null {
  if (cachedBinding !== null) {
    return cachedBinding;
  }

  if (process.platform !== 'darwin') {
    cachedReason = 'Native macOS overlay is only available on darwin.';
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const binding = require(nativeOverlayBindingPath);
    cachedBinding = binding as NativeOverlayBinding;
    cachedReason = null;
    return cachedBinding;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown addon load failure';
    cachedReason = `Native macOS overlay unavailable: ${message}`;
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
