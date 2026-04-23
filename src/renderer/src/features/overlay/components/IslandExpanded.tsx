import type { AgentApprovalDecision, AgentOverlayState } from '@shared/types/agent-hook';
import type { OverlayState } from '@shared/types/source-data';

import { AgentReminderCard } from './AgentReminderCard';
import { SourcePanel } from './SourcePanel';

type IslandExpandedProps = {
  state: OverlayState;
  onOpenTarget: (targetUrl: string | undefined) => void;
  onJumpToSession: (sessionId: string | undefined) => void;
  onResolveApproval: (sessionId: string | undefined, decision: AgentApprovalDecision) => void;
};

function renderAgentSection(
  agentState: AgentOverlayState,
  onJumpToSession: (sessionId: string | undefined) => void,
  onResolveApproval: (sessionId: string | undefined, decision: AgentApprovalDecision) => void
): JSX.Element | null {
  if (!agentState.activeReminder) {
    return null;
  }

  const reminderSession = agentState.sessions.find((session) => session.id === agentState.activeReminder?.sessionId);

  return (
    <div className="agent-feed">
      <AgentReminderCard
        reminder={agentState.activeReminder}
        session={reminderSession}
        onJumpToSession={onJumpToSession}
        onResolveApproval={(sessionId, decision) => {
          onResolveApproval(sessionId, decision);
        }}
      />
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

export function IslandExpanded({ state, onOpenTarget, onJumpToSession, onResolveApproval }: IslandExpandedProps): JSX.Element {
  const agentSection = renderAgentSection(state.agent, onJumpToSession, onResolveApproval);
  const sourceSection = state.agent.activeReminder ? null : renderSourceSection(state, onOpenTarget);
  const gridClassName = sourceSection ? 'island__expanded-grid' : 'island__expanded-grid island__expanded-grid--agent-only';

  return (
    <div className="island__expanded-stage">
      <div className={gridClassName}>
        {agentSection}
        {sourceSection}
        {!agentSection && !sourceSection ? (
          <section className="island-section island-section--empty">
            <p className="island-section__empty">还没有可展示的数据，前往设置页启用轮询源或 Agent Hook。</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
