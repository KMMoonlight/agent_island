import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '../shared/constants/channels';
import type { AppConfig } from '../shared/types/config';
import type { OverlayWindowMode, WindowApi } from '../shared/types/ipc';
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
    get: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG.GET),
    save: (config: AppConfig) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG.SAVE, config),
    validate: (candidate: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG.VALIDATE, candidate),
    refreshSources: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG.REFRESH_SOURCES),
  },
  agent: {
    getSetup: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT.GET_SETUP),
    installManagedHooks: (source, options) => ipcRenderer.invoke(IPC_CHANNELS.AGENT.INSTALL_MANAGED_HOOKS, source, options),
    uninstallManagedHooks: (source) => ipcRenderer.invoke(IPC_CHANNELS.AGENT.UNINSTALL_MANAGED_HOOKS, source),
    resolveApproval: (sessionId, decision) => ipcRenderer.invoke(IPC_CHANNELS.AGENT.RESOLVE_APPROVAL, sessionId, decision),
    answerQuestion: (sessionId, response) => ipcRenderer.invoke(IPC_CHANNELS.AGENT.ANSWER_QUESTION, sessionId, response),
    dismissReminder: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.AGENT.DISMISS_REMINDER, sessionId),
    handoffApproval: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.AGENT.HANDOFF_APPROVAL, sessionId),
  },
  app: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.APP.GET_STATUS),
    openTarget: (targetUrl) => ipcRenderer.invoke(IPC_CHANNELS.APP.OPEN_TARGET, targetUrl),
    jumpToAgentSession: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.APP.JUMP_TO_AGENT_SESSION, sessionId),
    setOverlayExpanded: (expanded, options) => ipcRenderer.invoke(IPC_CHANNELS.APP.SET_OVERLAY_EXPANDED, expanded, options),
    setExpandedContentHeight: (height) => ipcRenderer.invoke(IPC_CHANNELS.APP.SET_EXPANDED_CONTENT_HEIGHT, height),
    setReminderHoldActive: (active) => ipcRenderer.invoke(IPC_CHANNELS.APP.SET_REMINDER_HOLD_ACTIVE, active),
    dismissFocusTimerCompletion: () => ipcRenderer.invoke(IPC_CHANNELS.APP.DISMISS_FOCUS_TIMER_COMPLETION),
    subscribeOverlayMode: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, mode: OverlayWindowMode) => {
        listener(mode);
      };

      ipcRenderer.on(IPC_CHANNELS.APP.OVERLAY_MODE_CHANGED, handler);

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.APP.OVERLAY_MODE_CHANGED, handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
