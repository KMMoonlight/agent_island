import { Fragment, type JSX } from 'react';

function renderInlineCode(line: string, keyPrefix: string): JSX.Element[] {
  const segments = line.split(/(`[^`]+`)/g);

  return segments.map((segment, index) => {
    const key = `${keyPrefix}-${index}`;

    if (segment.startsWith('`') && segment.endsWith('`') && segment.length >= 2) {
      return (
        <code key={key} className="agent-rich-text__code">
          {segment.slice(1, -1)}
        </code>
      );
    }

    return (
      <Fragment key={key}>
        {segment}
      </Fragment>
    );
  });
}

export function renderAgentRichText(value: string): JSX.Element[] {
  const lines = value.split('\n');

  return lines.flatMap((line, index) => {
    const nodes = renderInlineCode(line, `line-${index}`);

    if (index === lines.length - 1) {
      return nodes;
    }

    return [
      ...nodes,
      <br key={`break-${index}`} />,
    ];
  });
}
