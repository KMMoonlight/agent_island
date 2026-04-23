import type { AgentApprovalDecision, AgentReminder, AgentSession } from '@shared/types/agent-hook';

import { renderAgentRichText } from './AgentRichText';

const PHASE_LABELS = {
  running: '进行中',
  'needs-approval': '等待确认',
  'needs-answer': '等待回答',
  completed: '已完成',
} as const;

function getToneClassName(tone: AgentReminder['tone']): string {
  switch (tone) {
    case 'attention':
      return 'agent-card--attention';
    case 'success':
      return 'agent-card--success';
    case 'info':
    default:
      return 'agent-card--info';
  }
}

export function AgentReminderCard({
  reminder,
  session,
  onJumpToSession,
  onResolveApproval,
}: {
  reminder: AgentReminder;
  session?: AgentSession;
  onJumpToSession?: ((sessionId: string) => void) | undefined;
  onResolveApproval?: ((sessionId: string, decision: AgentApprovalDecision) => void) | undefined;
}): JSX.Element {
  const isClickable = Boolean(onJumpToSession && session?.jumpTarget);
  const approvalOptions = session?.approvalRequest?.options ?? [];
  const canResolveApproval = Boolean(
    onResolveApproval
    && session
    && session.phase === 'needs-approval'
    && approvalOptions.length > 0
  );
  const className = `agent-card ${getToneClassName(reminder.tone)}${isClickable ? ' agent-card--clickable' : ''}`;
  const content = (
    <>
      <header className="agent-card__header">
        <p className="agent-card__title">{renderAgentRichText(reminder.title)}</p>
        <div className="agent-card__meta-row">
          {session?.terminalLabel ? <p className="agent-card__meta">{session.terminalLabel}</p> : null}
          <span className="agent-card__phase">{PHASE_LABELS[reminder.phase]}</span>
        </div>
      </header>
      <div className="agent-card__body">
        <p className="agent-card__summary">{renderAgentRichText(reminder.summary)}</p>
        {reminder.detail ? <p className="agent-card__detail">{renderAgentRichText(reminder.detail)}</p> : null}
      </div>
    </>
  );

  const mainContent = !isClickable || !session
    ? <div className="agent-card__main">{content}</div>
    : (
      <button
        type="button"
        className="agent-card__main"
        onClick={() => {
          onJumpToSession?.(session.id);
        }}
      >
        {content}
      </button>
    );

  return (
    <article className={className}>
      {mainContent}
      {canResolveApproval && session ? (
        <footer className="agent-card__footer">
          <div className={`agent-card__actions agent-card__actions--${approvalOptions.length}`}>
            {approvalOptions.map((option) => {
              const toneClassName = option.id === 'deny'
                ? 'agent-card__action--deny'
                : 'agent-card__action--primary';

              return (
                <button
                  key={option.id}
                  type="button"
                  className={`agent-card__action ${toneClassName}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onResolveApproval?.(session.id, option.id);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </footer>
      ) : null}
    </article>
  );
}
