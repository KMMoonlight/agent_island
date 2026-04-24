import { AGENT_TOOL_LABELS, type AgentSession } from '@shared/types/agent-hook';

import { AgentRichText } from './AgentRichText';

const PHASE_LABELS = {
  running: 'Running',
  'needs-approval': 'Needs approval',
  'needs-answer': 'Needs answer',
  completed: 'Completed',
} as const;

function getToolLabel(tool: AgentSession['tool']): string {
  return AGENT_TOOL_LABELS[tool];
}

export function AgentSessionPanel({ session }: { session: AgentSession }): JSX.Element {
  return (
    <article className="agent-session-panel">
      <div className="agent-session-panel__header">
        <div className="agent-session-panel__tags">
          <span className="agent-session-panel__badge">{getToolLabel(session.tool)}</span>
          <span className={`agent-session-panel__phase agent-session-panel__phase--${session.phase}`}>{PHASE_LABELS[session.phase]}</span>
        </div>
        <p className="agent-session-panel__workspace">{session.workspaceName}</p>
      </div>

      <div className="agent-session-panel__body">
        <AgentRichText className="agent-session-panel__summary" value={session.summary} />
        {session.prompt ? (
          <div className="agent-session-panel__prompt">
            <span className="agent-session-panel__prompt-label">你：</span>
            <AgentRichText className="agent-session-panel__prompt-body" value={session.prompt} />
          </div>
        ) : null}
        {session.detail ? <AgentRichText className="agent-session-panel__detail" value={session.detail} /> : null}
        {session.terminalLabel ? <p className="agent-session-panel__terminal">{session.terminalLabel}</p> : null}
      </div>
    </article>
  );
}
