import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/constants/channels';
import type { SourcePoller } from '../services/sources/source-poller';
import type { SourceStore } from '../services/state/source-store';

export function registerConfigHandlers(sourcePoller: SourcePoller, sourceStore: SourceStore): void {
  ipcMain.handle(IPC_CHANNELS.CONFIG.RELOAD, async () => {
    await sourcePoller.reload();
    return sourceStore.getState();
  });
}
