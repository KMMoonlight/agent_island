import type { AppConfig } from '../../shared/types/config';
import type { AppStatus, OverlayHostKind, OverlayWindowMode, ConfigValidationResult } from '../../shared/types/ipc';
import type { AgentApprovalDecision, AgentHookSetup, AgentQuestionResponse } from '../../shared/types/agent-hook';
import type { OverlayState } from '../../shared/types/source-data';

export type OverlayHostWindowMode = 'compact' | 'expanded';
export type OverlayModeChangeOptions = {
  suppressHoverUntilLeave?: boolean;
};

export type OverlayRendererTarget =
  | {
      kind: 'url';
      value: string;
    }
  | {
      kind: 'file';
      value: string;
    };

export type OverlayHostBridge = {
  getOverlayState: () => OverlayState;
  getConfig: () => AppConfig;
  saveConfig: (config: AppConfig) => Promise<AppConfig>;
  validateConfig: (candidate: unknown) => ConfigValidationResult;
  refreshSources: () => Promise<OverlayState>;
  getAgentSetup: () => AgentHookSetup;
  resolveAgentApproval: (sessionId: string, decision: AgentApprovalDecision) => Promise<boolean> | boolean;
  answerAgentQuestion: (sessionId: string, response: AgentQuestionResponse) => Promise<boolean> | boolean;
  handoffPendingApproval: (sessionId: string) => Promise<boolean> | boolean;
  getAppStatus: () => AppStatus;
  openTarget: (targetUrl: string) => Promise<boolean>;
  jumpToAgentSession: (sessionId: string) => Promise<boolean>;
  setOverlayExpanded: (expanded: boolean, options?: OverlayModeChangeOptions) => OverlayWindowMode;
  setExpandedContentHeight: (height: number) => void;
  setReminderHoldActive: (active: boolean) => void;
  isReminderHoldActive: () => boolean;
};

export type OverlayHostStatus = {
  active: OverlayHostKind;
  fallbackReason: string | null;
};

export type OverlayHost = {
  load: () => Promise<void>;
  showInactive: () => void;
  onClosed: (callback: () => void) => void;
  isDestroyed: () => boolean;
  send: (channel: string, payload: unknown) => void;
  setMode: (mode: OverlayHostWindowMode, options?: OverlayModeChangeOptions) => OverlayHostWindowMode;
  setExpandedContentHeight: (height: number) => void;
  destroy: () => void;
  getStatus: () => OverlayHostStatus;
};
