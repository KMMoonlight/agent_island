import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '../shared/constants/channels';
import type { WindowApi } from '../shared/types/ipc';
import type { OverlayState } from '../shared/types/source-data';

const api: WindowApi = {
  overlay: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.OVERLAY.GET_STATE),
    subscribe: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: OverlayState) => {
        listener(state);
      };

      ipcRenderer.on(IPC_CHANNELS.OVERLAY.UPDATED, handler);

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.OVERLAY.UPDATED, handler);
      };
    },
  },
  config: {
    reload: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG.RELOAD),
  },
  app: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.APP.GET_STATUS),
    openTarget: (targetUrl) => ipcRenderer.invoke(IPC_CHANNELS.APP.OPEN_TARGET, targetUrl),
    setOverlayExpanded: (expanded) => ipcRenderer.invoke(IPC_CHANNELS.APP.SET_OVERLAY_EXPANDED, expanded),
  },
};

contextBridge.exposeInMainWorld('api', api);
