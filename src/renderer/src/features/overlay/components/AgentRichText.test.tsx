import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AgentRichText } from './AgentRichText';

describe('AgentRichText', () => {
  it('renders fenced code blocks and inline code through markdown', () => {
    const html = renderToStaticMarkup(
      <AgentRichText
        value={[
          'Summary before code.',
          '',
          '```ts',
          'const value = 42;',
          '```',
          '',
          'After `value`.',
        ].join('\n')}
      />
    );

    expect(html).toContain('<pre>');
    expect(html).toContain('<code class="language-ts">const value = 42;');
    expect(html).toContain('<p>After <code>value</code>.</p>');
  });
});
