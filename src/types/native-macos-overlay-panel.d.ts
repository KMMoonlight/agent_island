declare module '../../../native/macos-overlay-panel/index.cjs' {
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

  const binding: NativeOverlayBinding;
  export = binding;
}
