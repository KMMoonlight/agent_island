import { APP_CONFIG } from '../../../shared/constants/config';
import type {
  AgentApprovalRequest,
  AgentOverlayState,
  AgentQuestionPrompt,
  AgentReminder,
  AgentSession,
} from '../../../shared/types/agent-hook';
import type { AppConfig } from '../../../shared/types/config';
import type { AppStatus, OverlayHostKind } from '../../../shared/types/ipc';
import type { OverlayState, SourceState } from '../../../shared/types/source-data';

import { createEmptySourceState } from '../sources/source-normalizer';

type StoreListener = (state: OverlayState) => void;

function cloneApprovalRequest(approvalRequest: AgentApprovalRequest | undefined): AgentApprovalRequest | undefined {
  if (!approvalRequest) {
    return undefined;
  }

  return {
    ...approvalRequest,
    options: approvalRequest.options.map((option) => ({ ...option })),
  };
}

function cloneQuestionPrompt(questionPrompt: AgentQuestionPrompt | undefined): AgentQuestionPrompt | undefined {
  if (!questionPrompt) {
    return undefined;
  }

  return {
    ...questionPrompt,
    questions: questionPrompt.questions.map((question) => ({
      ...question,
      options: question.options.map((option) => ({ ...option })),
    })),
  };
}

function cloneAgentSession(session: AgentSession): AgentSession {
  return {
    ...session,
    approvalRequest: cloneApprovalRequest(session.approvalRequest),
    questionPrompt: cloneQuestionPrompt(session.questionPrompt),
    jumpTarget: session.jumpTarget ? { ...session.jumpTarget } : undefined,
  };
}

function cloneAgentReminder(reminder: AgentReminder): AgentReminder {
  return {
    ...reminder,
  };
}

function cloneAgentState(state: AgentOverlayState): AgentOverlayState {
  return {
    sessions: state.sessions.map(cloneAgentSession),
    activeReminder: state.activeReminder ? cloneAgentReminder(state.activeReminder) : null,
  };
}

function cloneState(state: OverlayState): OverlayState {
  return {
    ...state,
    sources: state.sources.map((source) => ({
      ...source,
      summary: { ...source.summary },
      items: source.items.map((item) => ({ ...item })),
      lastError: source.lastError ? { ...source.lastError } : null,
    })),
    agent: cloneAgentState(state.agent),
  };
}

export class SourceStore {
  private state: OverlayState = {
    rotationIntervalMs: APP_CONFIG.rotationIntervalMs,
    sources: [],
    agent: {
      sessions: [],
      activeReminder: null,
    },
    updatedAtMs: Date.now(),
    hasErrors: false,
  };

  private overlayHostKind: OverlayHostKind = 'browser-window';

  private readonly listeners = new Set<StoreListener>();

  initialize(config: AppConfig): void {
    this.state = {
      rotationIntervalMs: config.rotationIntervalMs,
      sources: config.sources.map((source) => createEmptySourceState(source)),
      agent: cloneAgentState(this.state.agent),
      updatedAtMs: Date.now(),
      hasErrors: false,
    };

    this.emit();
  }

  setOverlayHostKind(overlayHostKind: OverlayHostKind): void {
    this.overlayHostKind = overlayHostKind;
  }

  setAgentState(agentState: AgentOverlayState): void {
    this.state = {
      ...this.state,
      agent: cloneAgentState(agentState),
      updatedAtMs: Date.now(),
    };

    this.emit();
  }

  getState(): OverlayState {
    return cloneState(this.state);
  }

  getSourceState(sourceId: string): SourceState | undefined {
    return this.state.sources.find((source) => source.id === sourceId);
  }

  getStatus(): AppStatus {
    return {
      hasErrors: this.state.hasErrors,
      sourceCount: this.state.sources.length,
      updatedAtMs: this.state.updatedAtMs,
      overlayHostKind: this.overlayHostKind,
    };
  }

  updateSource(nextSource: SourceState): void {
    const sources = this.state.sources.map((source) => (source.id === nextSource.id ? nextSource : source));

    this.state = {
      ...this.state,
      sources,
      updatedAtMs: Date.now(),
      hasErrors: sources.some((source) => source.status === 'error'),
    };

    this.emit();
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.getState();

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
