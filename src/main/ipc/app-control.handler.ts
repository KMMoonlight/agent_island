import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/constants/channels';
import type { OverlayWindowMode } from '../../shared/types/ipc';
import type { SourceStore } from '../services/state/source-store';
import { openExternalTarget } from '../utils/open-external';

type AppControlActions = {
  getOverlayMode: () => OverlayWindowMode;
  setOverlayExpanded: (expanded: boolean) => OverlayWindowMode;
};

export function registerAppControlHandlers(sourceStore: SourceStore, actions: AppControlActions): void {
  ipcMain.handle(IPC_CHANNELS.APP.GET_STATUS, () => sourceStore.getStatus());
  ipcMain.handle(IPC_CHANNELS.APP.OPEN_TARGET, async (_event, targetUrl: unknown) => {
    if (typeof targetUrl !== 'string') {
      return false;
    }

    return openExternalTarget(targetUrl);
  });
  ipcMain.handle(IPC_CHANNELS.APP.SET_OVERLAY_EXPANDED, (_event, expanded: unknown) => {
    if (typeof expanded !== 'boolean') {
      return actions.getOverlayMode();
    }

    return actions.setOverlayExpanded(expanded);
  });
}
