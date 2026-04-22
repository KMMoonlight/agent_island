import type { AppConfig } from '../../shared/types/config';
import type { AppStatus, OverlayHostKind, OverlayWindowMode, ConfigValidationResult } from '../../shared/types/ipc';
import type { OverlayState } from '../../shared/types/source-data';

export type OverlayHostWindowMode = 'compact' | 'expanded';

export type OverlayRendererTarget =
  | {
      kind: 'url';
      value: string;
    }
  | {
      kind: 'file';
      value: string;
    };

export type OverlayHostBridge = {
  getOverlayState: () => OverlayState;
  getConfig: () => AppConfig;
  saveConfig: (config: AppConfig) => Promise<AppConfig>;
  validateConfig: (candidate: unknown) => ConfigValidationResult;
  refreshSources: () => Promise<OverlayState>;
  getAppStatus: () => AppStatus;
  openTarget: (targetUrl: string) => Promise<boolean>;
  setOverlayExpanded: (expanded: boolean) => OverlayWindowMode;
};

export type OverlayHostStatus = {
  active: OverlayHostKind;
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
