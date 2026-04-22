export const IPC_CHANNELS = {
  OVERLAY: {
    GET_STATE: 'overlay:get-state',
    SUBSCRIBE: 'overlay:subscribe',
    UNSUBSCRIBE: 'overlay:unsubscribe',
    UPDATED: 'overlay:updated',
  },
  CONFIG: {
    GET: 'config:get',
    SAVE: 'config:save',
    VALIDATE: 'config:validate',
    REFRESH_SOURCES: 'config:refresh-sources',
  },
  APP: {
    OPEN_TARGET: 'app:open-target',
    GET_STATUS: 'app:get-status',
    SET_OVERLAY_EXPANDED: 'app:set-overlay-expanded',
    OVERLAY_MODE_CHANGED: 'app:overlay-mode-changed',
  },
} as const;
