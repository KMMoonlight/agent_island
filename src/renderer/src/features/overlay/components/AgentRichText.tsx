import type { JSX } from 'react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type AgentRichTextProps = {
  className?: string;
  value: string;
};

export function AgentRichText({ className, value }: AgentRichTextProps): JSX.Element {
  const resolvedClassName = className ? `agent-rich-text ${className}` : 'agent-rich-text';

  return (
    <div className={resolvedClassName}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {value}
      </ReactMarkdown>
    </div>
  );
}
