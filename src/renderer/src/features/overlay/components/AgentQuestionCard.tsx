import { useMemo, useState } from 'react';

import type { AgentQuestionResponse, AgentReminder, AgentSession } from '@shared/types/agent-hook';

import { renderAgentRichText } from './AgentRichText';

const PHASE_LABELS = {
  running: 'Running',
  'needs-approval': 'Needs approval',
  'needs-answer': 'Needs answer',
  completed: 'Completed',
} as const;

type AgentQuestionCardProps = {
  reminder: AgentReminder;
  session: AgentSession;
  onAnswerQuestion: (sessionId: string, response: AgentQuestionResponse) => void;
};

export function AgentQuestionCard({
  reminder,
  session,
  onAnswerQuestion,
}: AgentQuestionCardProps): JSX.Element {
  const prompt = session.questionPrompt;
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>({});
  const [freeformAnswers, setFreeformAnswers] = useState<Record<string, string>>({});

  const answers = useMemo<Record<string, string>>(() => {
    const entries = (prompt?.questions ?? []).flatMap((question) => {
      const selected = selectedAnswers[question.question] ?? [];

      if (question.options.length === 0) {
        const freeform = freeformAnswers[question.question]?.trim() ?? '';
        return freeform ? [[question.question, freeform] as const] : [];
      }

      const resolved = selected.map((label) => {
        const option = question.options.find((item) => item.label === label);
        if (option?.allowsFreeform) {
          return freeformAnswers[`${question.question}:${label}`]?.trim() ?? '';
        }

        return label;
      }).filter((value) => value.length > 0);

      return resolved.length > 0 ? [[question.question, resolved.join(', ')] as const] : [];
    });

    return Object.fromEntries(entries);
  }, [freeformAnswers, prompt?.questions, selectedAnswers]);

  const canSubmit = (prompt?.questions ?? []).every((question) => {
    if (question.options.length === 0) {
      return (freeformAnswers[question.question]?.trim() ?? '').length > 0;
    }

    const selected = selectedAnswers[question.question] ?? [];
    if (selected.length === 0) {
      return false;
    }

    return selected.every((label) => {
      const option = question.options.find((item) => item.label === label);
      if (!option?.allowsFreeform) {
        return true;
      }

      return (freeformAnswers[`${question.question}:${label}`]?.trim() ?? '').length > 0;
    });
  });

  const toggleOption = (questionKey: string, label: string, multiSelect: boolean): void => {
    setSelectedAnswers((current) => {
      const existing = new Set(current[questionKey] ?? []);

      if (multiSelect) {
        if (existing.has(label)) {
          existing.delete(label);
        } else {
          existing.add(label);
        }
      } else {
        if (existing.has(label)) {
          existing.clear();
        } else {
          existing.clear();
          existing.add(label);
        }
      }

      return {
        ...current,
        [questionKey]: Array.from(existing),
      };
    });
  };

  return (
    <article className="agent-card agent-card--attention">
      <div className="agent-card__main">
        <header className="agent-card__header">
          <p className="agent-card__title">{renderAgentRichText(reminder.title)}</p>
          <div className="agent-card__meta-row">
            {session.terminalLabel ? <p className="agent-card__meta">{session.terminalLabel}</p> : null}
            <span className="agent-card__phase">{PHASE_LABELS[session.phase]}</span>
          </div>
        </header>
        <div className="agent-card__body">
          <p className="agent-card__summary">{renderAgentRichText(reminder.summary)}</p>
          <div className="agent-question-card">
            {(prompt?.questions ?? []).map((question) => {
              const selected = new Set(selectedAnswers[question.question] ?? []);

              return (
                <section key={question.question} className="agent-question-card__section">
                  {(prompt?.questions.length ?? 0) > 1 ? (
                    <p className="agent-question-card__header">{question.header}</p>
                  ) : null}
                  <p className="agent-question-card__question">{question.question}</p>
                  {question.options.length === 0 ? (
                    <textarea
                      className="agent-question-card__input"
                      value={freeformAnswers[question.question] ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setFreeformAnswers((current) => ({
                          ...current,
                          [question.question]: value,
                        }));
                      }}
                      rows={3}
                      placeholder="Type your answer…"
                    />
                  ) : (
                    <div className="agent-question-card__options">
                      {question.options.map((option) => {
                        const isSelected = selected.has(option.label);

                        return (
                          <label
                            key={option.label}
                            className={`agent-question-card__option${isSelected ? ' agent-question-card__option--selected' : ''}`}
                            style={{ cursor: 'pointer' }}
                          >
                            <input
                              type={question.multiSelect ? 'checkbox' : 'radio'}
                              name={question.question}
                              checked={isSelected}
                              style={{ cursor: 'pointer' }}
                              onChange={() => {
                                toggleOption(question.question, option.label, question.multiSelect);
                              }}
                            />
                            <div className="agent-question-card__option-copy">
                              <span className="agent-question-card__option-label">{option.label}</span>
                              {option.description ? (
                                <span className="agent-question-card__option-description">{option.description}</span>
                              ) : null}
                            </div>
                            {option.allowsFreeform && isSelected ? (
                              <input
                                className="agent-question-card__input agent-question-card__input--inline"
                                value={freeformAnswers[`${question.question}:${option.label}`] ?? ''}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setFreeformAnswers((current) => ({
                                    ...current,
                                    [`${question.question}:${option.label}`]: value,
                                  }));
                                }}
                                placeholder="Type your answer…"
                              />
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>
      <footer className="agent-card__footer">
        <div className="agent-card__actions agent-card__actions--1">
          <button
            type="button"
            className="agent-card__action agent-card__action--primary"
            disabled={!canSubmit}
            style={{ cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            onClick={() => {
              onAnswerQuestion(session.id, { answers });
            }}
          >
            Submit Answers
          </button>
        </div>
      </footer>
    </article>
  );
}
