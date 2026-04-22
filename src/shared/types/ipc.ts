import type { AppConfig } from './config';
import type { OverlayState } from './source-data';

export type OverlayHostKind = 'native-macos-panel' | 'browser-window';

export type AppStatus = {
  hasErrors: boolean;
  sourceCount: number;
  updatedAtMs: number;
  overlayHostKind: OverlayHostKind;
};

export type OverlayWindowMode = 'compact' | 'expanded';

export type ConfigValidationResult =
  | {
      ok: true;
      config: AppConfig;
    }
  | {
      ok: false;
      error: string;
    };

export type OverlayApi = {
  getState: () => Promise<OverlayState>;
  subscribe: (listener: (state: OverlayState) => void) => () => void;
};

export type ConfigApi = {
  get: () => Promise<AppConfig>;
  save: (config: AppConfig) => Promise<AppConfig>;
  validate: (candidate: unknown) => Promise<ConfigValidationResult>;
  refreshSources: () => Promise<OverlayState>;
};

export type AppApi = {
  getStatus: () => Promise<AppStatus>;
  openTarget: (targetUrl: string) => Promise<boolean>;
  setOverlayExpanded: (expanded: boolean) => Promise<OverlayWindowMode>;
  subscribeOverlayMode: (listener: (mode: OverlayWindowMode) => void) => () => void;
};

export type WindowApi = {
  overlay: OverlayApi;
  config: ConfigApi;
  app: AppApi;
};
