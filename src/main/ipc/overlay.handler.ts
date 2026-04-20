import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/constants/channels';
import type { SourceStore } from '../services/state/source-store';

export function registerOverlayHandlers(sourceStore: SourceStore): void {
  ipcMain.handle(IPC_CHANNELS.OVERLAY.GET_STATE, () => sourceStore.getState());
}
