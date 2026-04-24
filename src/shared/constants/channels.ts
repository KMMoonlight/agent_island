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
  AGENT: {
    GET_SETUP: 'agent:get-setup',
    INSTALL_MANAGED_HOOKS: 'agent:install-managed-hooks',
    UNINSTALL_MANAGED_HOOKS: 'agent:uninstall-managed-hooks',
    RESOLVE_APPROVAL: 'agent:resolve-approval',
    ANSWER_QUESTION: 'agent:answer-question',
    DISMISS_REMINDER: 'agent:dismiss-reminder',
    HANDOFF_APPROVAL: 'agent:handoff-approval',
  },
  APP: {
    OPEN_TARGET: 'app:open-target',
    JUMP_TO_AGENT_SESSION: 'app:jump-to-agent-session',
    GET_STATUS: 'app:get-status',
    SET_OVERLAY_EXPANDED: 'app:set-overlay-expanded',
    SET_EXPANDED_CONTENT_HEIGHT: 'app:set-expanded-content-height',
    SET_REMINDER_HOLD_ACTIVE: 'app:set-reminder-hold-active',
    DISMISS_FOCUS_TIMER_COMPLETION: 'app:dismiss-focus-timer-completion',
    OVERLAY_MODE_CHANGED: 'app:overlay-mode-changed',
  },
} as const;
