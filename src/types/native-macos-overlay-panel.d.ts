declare module '../../../native/macos-overlay-panel/index.cjs' {
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

  const binding: NativeOverlayBinding;
  export = binding;
}
