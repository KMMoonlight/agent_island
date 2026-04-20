import type { OverlayState } from './source-data';

export type AppStatus = {
  hasErrors: boolean;
  sourceCount: number;
  updatedAtMs: number;
};

export type OverlayWindowMode = 'compact' | 'expanded';

export type OverlayApi = {
  getState: () => Promise<OverlayState>;
  subscribe: (listener: (state: OverlayState) => void) => () => void;
};

export type ConfigApi = {
  reload: () => Promise<OverlayState>;
};

export type AppApi = {
  getStatus: () => Promise<AppStatus>;
  openTarget: (targetUrl: string) => Promise<boolean>;
  setOverlayExpanded: (expanded: boolean) => Promise<OverlayWindowMode>;
};

export type WindowApi = {
  overlay: OverlayApi;
  config: ConfigApi;
  app: AppApi;
};
