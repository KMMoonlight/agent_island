import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/constants/channels';
import type { OverlayExpandOptions, OverlayWindowMode } from '../../shared/types/ipc';
import type { SourceStore } from '../services/state/source-store';
import { jumpToTerminalWindow } from '../utils/jump-to-terminal';
import { openExternalTarget } from '../utils/open-external';

type AppControlActions = {
  getOverlayMode: () => OverlayWindowMode;
  setOverlayExpanded: (expanded: boolean, options?: OverlayExpandOptions) => OverlayWindowMode;
  setExpandedContentHeight: (height: number) => void;
  setReminderHoldActive: (active: boolean) => void;
};

export function registerAppControlHandlers(sourceStore: SourceStore, actions: AppControlActions): void {
  ipcMain.handle(IPC_CHANNELS.APP.GET_STATUS, () => sourceStore.getStatus());
  ipcMain.handle(IPC_CHANNELS.APP.OPEN_TARGET, async (_event, targetUrl: unknown) => {
    if (typeof targetUrl !== 'string') {
      return false;
    }

    return openExternalTarget(targetUrl);
  });
  ipcMain.handle(IPC_CHANNELS.APP.JUMP_TO_AGENT_SESSION, async (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string') {
      return false;
    }

    const session = sourceStore.getState().agent.sessions.find((item) => item.id === sessionId);
    return jumpToTerminalWindow(session?.jumpTarget);
  });
  ipcMain.handle(IPC_CHANNELS.APP.SET_OVERLAY_EXPANDED, (_event, expanded: unknown, options: unknown) => {
    if (typeof expanded !== 'boolean') {
      return actions.getOverlayMode();
    }

    const normalizedOptions =
      typeof options === 'object' && options !== null
        ? options as OverlayExpandOptions
        : undefined;

    return actions.setOverlayExpanded(expanded, normalizedOptions);
  });
  ipcMain.handle(IPC_CHANNELS.APP.SET_EXPANDED_CONTENT_HEIGHT, (_event, height: unknown) => {
    if (typeof height !== 'number' || !Number.isFinite(height)) {
      return;
    }

    actions.setExpandedContentHeight(height);
  });
  ipcMain.handle(IPC_CHANNELS.APP.SET_REMINDER_HOLD_ACTIVE, (_event, active: unknown) => {
    if (typeof active !== 'boolean') {
      return;
    }

    actions.setReminderHoldActive(active);
  });
}
