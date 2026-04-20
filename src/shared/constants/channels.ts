export const IPC_CHANNELS = {
  OVERLAY: {
    GET_STATE: 'overlay:get-state',
    SUBSCRIBE: 'overlay:subscribe',
    UNSUBSCRIBE: 'overlay:unsubscribe',
    UPDATED: 'overlay:updated',
  },
  CONFIG: {
    RELOAD: 'config:reload',
  },
  APP: {
    OPEN_TARGET: 'app:open-target',
    GET_STATUS: 'app:get-status',
    SET_OVERLAY_EXPANDED: 'app:set-overlay-expanded',
  },
} as const;
