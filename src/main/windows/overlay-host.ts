export type OverlayHostWindowMode = 'compact' | 'expanded';

export type OverlayHostStatus = {
  active: 'native-macos-panel' | 'browser-window';
  fallbackReason: string | null;
};

export type OverlayHost = {
  load: () => Promise<void>;
  showInactive: () => void;
  onClosed: (callback: () => void) => void;
  isDestroyed: () => boolean;
  send: (channel: string, payload: unknown) => void;
  setMode: (mode: OverlayHostWindowMode) => OverlayHostWindowMode;
  destroy: () => void;
  getStatus: () => OverlayHostStatus;
};
