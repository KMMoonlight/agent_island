import { contextBridge, ipcRenderer } from "electron";
const IPC_CHANNELS = {
  OVERLAY: {
    GET_STATE: "overlay:get-state",
    UPDATED: "overlay:updated"
  },
  CONFIG: {
    RELOAD: "config:reload"
  },
  APP: {
    OPEN_TARGET: "app:open-target",
    GET_STATUS: "app:get-status",
    SET_OVERLAY_EXPANDED: "app:set-overlay-expanded"
  }
};
const api = {
  overlay: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.OVERLAY.GET_STATE),
    subscribe: (listener) => {
      const handler = (_event, state) => {
        listener(state);
      };
      ipcRenderer.on(IPC_CHANNELS.OVERLAY.UPDATED, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.OVERLAY.UPDATED, handler);
      };
    }
  },
  config: {
    reload: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG.RELOAD)
  },
  app: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.APP.GET_STATUS),
    openTarget: (targetUrl) => ipcRenderer.invoke(IPC_CHANNELS.APP.OPEN_TARGET, targetUrl),
    setOverlayExpanded: (expanded) => ipcRenderer.invoke(IPC_CHANNELS.APP.SET_OVERLAY_EXPANDED, expanded)
  }
};
contextBridge.exposeInMainWorld("api", api);
