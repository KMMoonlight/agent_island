import type { AgentApprovalDecision, AgentOverlayState, AgentQuestionResponse } from '@shared/types/agent-hook';
import type { ActiveFocusTimer, CompletedFocusTimer, OverlayState } from '@shared/types/source-data';

import { AgentQuestionCard } from './AgentQuestionCard';
import { AgentReminderCard } from './AgentReminderCard';
import { SourcePanel } from './SourcePanel';

type IslandExpandedProps = {
  nowMs: number;
  state: OverlayState;
  onOpenTarget: (targetUrl: string | undefined) => void;
  onJumpToSession: (sessionId: string | undefined) => void;
  onResolveApproval: (sessionId: string | undefined, decision: AgentApprovalDecision) => void;
  onAnswerQuestion: (sessionId: string | undefined, response: AgentQuestionResponse) => void;
  onDismissFocusTimerCompletion: () => void;
};

function formatTimerRemaining(endsAtMs: number, nowMs: number): string {
  const remainingSeconds = Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getTimerProgress(timer: ActiveFocusTimer, nowMs: number): number {
  if (timer.durationMs <= 0) {
    return 1;
  }

  const elapsedMs = Math.max(0, Math.min(timer.durationMs, nowMs - timer.startedAtMs));
  return elapsedMs / timer.durationMs;
}

function renderFocusTimerSection(timer: ActiveFocusTimer | null, nowMs: number): JSX.Element | null {
  if (!timer) {
    return null;
  }

  const progress = getTimerProgress(timer, nowMs);

  return (
    <section className="focus-timer-panel">
      <div className="focus-timer-panel__copy">
        <p className="focus-timer-panel__label">{timer.label}</p>
        <p className="focus-timer-panel__time">{formatTimerRemaining(timer.endsAtMs, nowMs)}</p>
      </div>
      <div className="focus-timer-panel__track" aria-hidden="true">
        <span
          className="focus-timer-panel__bar"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </section>
  );
}

function renderCompletedFocusTimerSection(
  completedTimer: CompletedFocusTimer | null,
  onDismissFocusTimerCompletion: () => void
): JSX.Element | null {
  if (!completedTimer) {
    return null;
  }

  return (
    <section
      className="agent-card agent-card--success agent-card--clickable focus-timer-complete-card"
      role="button"
      tabIndex={0}
      onMouseDown={(event) => {
        event.preventDefault();
        onDismissFocusTimerCompletion();
      }}
      onClick={(event) => {
        if (event.detail !== 0) {
          return;
        }

        onDismissFocusTimerCompletion();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();
        onDismissFocusTimerCompletion();
      }}
    >
      <div className="agent-card__main">
        <header className="agent-card__header">
          <p className="agent-card__title">倒计时结束</p>
          <div className="agent-card__meta-row">
            <span className="agent-card__phase">Completed</span>
          </div>
        </header>
        <div className="agent-card__body">
          <p className="agent-card__summary">{completedTimer.label}</p>
        </div>
      </div>
    </section>
  );
}

function renderAgentSection(
  agentState: AgentOverlayState,
  onJumpToSession: (sessionId: string | undefined) => void,
  onResolveApproval: (sessionId: string | undefined, decision: AgentApprovalDecision) => void,
  onAnswerQuestion: (sessionId: string | undefined, response: AgentQuestionResponse) => void
): JSX.Element | null {
  if (!agentState.activeReminder) {
    return null;
  }

  const reminderSession = agentState.sessions.find((session) => session.id === agentState.activeReminder?.sessionId);

  return (
    <div className="agent-feed">
      {reminderSession?.phase === 'needs-answer' && reminderSession.questionPrompt ? (
        <AgentQuestionCard
          reminder={agentState.activeReminder}
          session={reminderSession}
          onAnswerQuestion={(sessionId, response) => {
            onAnswerQuestion(sessionId, response);
          }}
        />
      ) : (
        <AgentReminderCard
          reminder={agentState.activeReminder}
          session={reminderSession}
          onJumpToSession={onJumpToSession}
          onResolveApproval={(sessionId, decision) => {
            onResolveApproval(sessionId, decision);
          }}
        />
      )}
    </div>
  );
}

function renderSourceSection(
  state: OverlayState,
  onOpenTarget: (targetUrl: string | undefined) => void
): JSX.Element | null {
  if (state.sources.length === 0) {
    return null;
  }

  return (
    <div className="island-source-stack">
      <div className="island-section__stack">
        {state.sources.map((source) => (
          <SourcePanel key={source.id} source={source} onOpenTarget={onOpenTarget} />
        ))}
      </div>
    </div>
  );
}

export function IslandExpanded({
  nowMs,
  state,
  onOpenTarget,
  onJumpToSession,
  onResolveApproval,
  onAnswerQuestion,
  onDismissFocusTimerCompletion,
}: IslandExpandedProps): JSX.Element {
  const agentSection = renderAgentSection(state.agent, onJumpToSession, onResolveApproval, onAnswerQuestion);
  const completedFocusTimerSection = renderCompletedFocusTimerSection(state.focusTimer.completed, onDismissFocusTimerCompletion);
  const focusTimerSection = renderFocusTimerSection(state.focusTimer.active, nowMs);
  const sourceSection = state.agent.activeReminder || state.focusTimer.completed ? null : renderSourceSection(state, onOpenTarget);
  const hasListContent = Boolean(focusTimerSection || sourceSection);
  const gridClassName = hasListContent ? 'island__expanded-grid' : 'island__expanded-grid island__expanded-grid--agent-only';
  const stageClassName = hasListContent ? 'island__expanded-stage' : 'island__expanded-stage island__expanded-stage--agent-only';

  return (
    <div className={stageClassName}>
      <div className={gridClassName}>
        {agentSection}
        {completedFocusTimerSection}
        {focusTimerSection}
        {sourceSection}
        {!agentSection && !completedFocusTimerSection && !focusTimerSection && !sourceSection ? (
          <section className="island-section island-section--empty">
            <p className="island-section__empty">还没有可展示的数据，前往设置页启用轮询源或 Agent Hook。</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
