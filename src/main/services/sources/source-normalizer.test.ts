import { describe, expect, it } from 'vitest';

import type { SourceConfig } from '../../../shared/types/config';

import { normalizeSourceState, withSourceError } from './source-normalizer';

function createJsonConfig(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: 'weather',
    name: 'Weather',
    type: 'json',
    url: 'https://example.com/weather.json',
    refreshIntervalMs: 60000,
    fieldMappings: {
      title: 'headline',
      summary: 'summary',
      detail: 'detail',
      timestamp: 'publishedAt',
      target: 'link',
    },
    ...overrides,
  };
}

describe('source-normalizer', () => {
  it('uses per-type default detail counts for JSON sources', () => {
    const config = createJsonConfig();
    const state = normalizeSourceState(config, {
      fetchedAtMs: 1710000000000,
      items: [
        { headline: 'One', summary: 'First', detail: 'First detail' },
        { headline: 'Two', summary: 'Second', detail: 'Second detail' },
      ],
    });

    expect(state.items).toHaveLength(1);
    expect(state.summary.title).toBe('One');
  });

  it('respects overridden detail item counts and mapped targets', () => {
    const config = createJsonConfig({ detailItemCount: 2, clickTarget: { source: 'https://example.com/fallback' } });
    const state = normalizeSourceState(config, {
      fetchedAtMs: 1710000000000,
      items: [
        { headline: 'One', summary: 'First', detail: 'First detail', link: 'https://example.com/1' },
        { headline: 'Two', summary: 'Second', detail: 'Second detail' },
      ],
    });

    expect(state.items).toHaveLength(2);
    expect(state.items[0]?.clickTarget).toBe('https://example.com/1');
    expect(state.items[1]?.clickTarget).toBe('https://example.com/fallback');
  });

  it('retains stale data when a source errors', () => {
    const config = createJsonConfig();
    const readyState = normalizeSourceState(config, {
      fetchedAtMs: 1710000000000,
      items: [{ headline: 'One', summary: 'First', detail: 'First detail' }],
    });

    const errorState = withSourceError(config, readyState, new Error('Network timeout'));

    expect(errorState.status).toBe('error');
    expect(errorState.items).toHaveLength(1);
    expect(errorState.lastError?.message).toBe('Network timeout');
  });
});
