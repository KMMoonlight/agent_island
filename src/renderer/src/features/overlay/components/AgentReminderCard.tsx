import type { AgentApprovalDecision, AgentReminder, AgentSession } from '@shared/types/agent-hook';

import { renderAgentRichText } from './AgentRichText';

const PHASE_LABELS = {
  running: 'Running',
  'needs-approval': 'Needs approval',
  'needs-answer': 'Needs answer',
  completed: 'Completed',
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
  const shouldUseCardJump = isClickable && !canResolveApproval;
  const className = `agent-card ${getToneClassName(reminder.tone)}${shouldUseCardJump ? ' agent-card--clickable' : ''}`;
  const approvalRequest = session?.approvalRequest;
  const triggerJumpToSession = (): void => {
    if (!session) {
      return;
    }

    onJumpToSession?.(session.id);
  };
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
        {approvalRequest ? (
          <div className="agent-card__approval-preview">
            <p className="agent-card__approval-command">{renderAgentRichText(approvalRequest.command)}</p>
            {approvalRequest.affectedPath ? (
              <p className="agent-card__approval-path">{renderAgentRichText(approvalRequest.affectedPath)}</p>
            ) : null}
          </div>
        ) : reminder.detail ? (
          <p className="agent-card__detail">{renderAgentRichText(reminder.detail)}</p>
        ) : null}
      </div>
    </>
  );

  const mainContent = <div className="agent-card__main">{content}</div>;

  return (
    <article
      className={className}
      role={shouldUseCardJump ? 'button' : undefined}
      tabIndex={shouldUseCardJump ? 0 : undefined}
      style={shouldUseCardJump ? { cursor: 'pointer' } : undefined}
      onMouseDown={shouldUseCardJump ? ((event) => {
        event.preventDefault();
        triggerJumpToSession();
      }) : undefined}
      onClick={shouldUseCardJump ? ((event) => {
        if (event.detail !== 0) {
          return;
        }

        triggerJumpToSession();
      }) : undefined}
      onKeyDown={shouldUseCardJump ? ((event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();
        triggerJumpToSession();
      }) : undefined}
    >
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
                  style={{ cursor: option.id === 'deny' ? 'pointer' : 'pointer' }}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
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
