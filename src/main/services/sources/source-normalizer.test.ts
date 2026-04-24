import { describe, expect, it } from 'vitest';

import type { SourceConfig } from '../../../shared/types/config';

import { normalizeSourceState, withSourceError } from './source-normalizer';

function createJsonConfig(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: 'weather',
    name: 'Weather',
    refreshIntervalMs: 60000,
    request: {
      url: 'https://example.com/weather.json',
      method: 'GET',
      headers: [],
      params: [],
      body: undefined,
    },
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
  it('uses default detail counts for JSON sources', () => {
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

  it('resolves plain path mappings without template syntax', () => {
    const config = createJsonConfig();
    const state = normalizeSourceState(config, {
      fetchedAtMs: 1710000000000,
      items: [{ headline: 'Cloudy', summary: '18 C', detail: 'Feels like 16 C', link: 'https://example.com/weather' }],
    });

    expect(state.summary.title).toBe('Cloudy');
    expect(state.summary.text).toBe('18 C');
    expect(state.items[0]?.detail).toBe('Feels like 16 C');
  });

  it('treats non-template literals as direct text when no path exists', () => {
    const config = createJsonConfig({
      fieldMappings: {
        title: '温度',
        summary: '温度',
        detail: '温度',
      },
    });
    const state = normalizeSourceState(config, {
      fetchedAtMs: 1710000000000,
      payload: {
        status_code: 200,
      },
      items: [{ headline: 'Cloudy', summary: '18 C', detail: 'Feels like 16 C' }],
    });

    expect(state.summary.title).toBe('温度');
    expect(state.summary.text).toBe('温度');
    expect(state.items[0]?.detail).toBe('温度');
  });

  it('treats title mappings as fixed text when configured that way', () => {
    const config = createJsonConfig({
      fieldMappings: {
        title: 'Soxio1',
        summary: 'summary',
        detail: 'detail',
      },
    });
    const state = normalizeSourceState(config, {
      fetchedAtMs: 1710000000000,
      items: [{ summary: '18 C', detail: 'Feels like 16 C' }],
    });

    expect(state.summary.title).toBe('Soxio1');
    expect(state.items[0]?.title).toBe('Soxio1');
    expect(state.summary.text).toBe('18 C');
    expect(state.items[0]?.detail).toBe('Feels like 16 C');
  });

  it('resolves template mappings against the full payload', () => {
    const config = createJsonConfig({
      fieldMappings: {
        title: 'headline',
        summary: '{{ $data.status_code }}',
        detail: 'Build {{ $data.meta.version }}',
        target: '{{ $data.links.dashboard }}',
      },
    });
    const state = normalizeSourceState(config, {
      fetchedAtMs: 1710000000000,
      payload: {
        status_code: 200,
        meta: { version: '2026.04.21' },
        links: { dashboard: 'https://example.com/dashboard' },
      },
      items: [{ headline: 'API healthy' }],
    });

    expect(state.summary.title).toBe('API healthy');
    expect(state.summary.text).toBe('200');
    expect(state.items[0]?.detail).toBe('Build 2026.04.21');
    expect(state.items[0]?.clickTarget).toBe('https://example.com/dashboard');
  });

  it('supports string and number expressions inside templates', () => {
    const config = createJsonConfig({
      fieldMappings: {
        title: '{{ $data.label.trim() }}',
        summary: 'Rate {{ $data.value.toFixed(2) }}',
        detail: '{{ $data.label.trim() }} · {{ $data.value.toFixed(1) }}',
      },
    });
    const state = normalizeSourceState(config, {
      fetchedAtMs: 1710000000000,
      payload: {
        label: '  Ready  ',
        value: 12.345,
      },
      items: [{}],
    });

    expect(state.summary.title).toBe('Ready');
    expect(state.summary.text).toBe('Rate 12.35');
    expect(state.items[0]?.detail).toBe('Ready · 12.3');
  });

  it('supports arithmetic, concatenation, and conditional expressions around $data references', () => {
    const config = createJsonConfig({
      fieldMappings: {
        title: "{{ 'Progress ' + $data.label.trim() }}",
        summary: '{{ 100 - $data.value }}',
        detail: "{{ $data.value >= 40 ? 'done' : 'pending' }} / {{ ($data.value ?? 0) + 5 }}",
      },
    });
    const state = normalizeSourceState(config, {
      fetchedAtMs: 1710000000000,
      payload: {
        label: '  Alpha  ',
        value: 42,
      },
      items: [{}],
    });

    expect(state.summary.title).toBe('Progress Alpha');
    expect(state.summary.text).toBe('58');
    expect(state.items[0]?.detail).toBe('done / 47');
  });

  it('uses None for any missing title, summary, or detail field', () => {
    const config = createJsonConfig();
    const state = normalizeSourceState(config, {
      fetchedAtMs: 1710000000000,
      items: [{ summary: '18 C' }],
    });

    expect(state.summary.title).toBe('None');
    expect(state.summary.text).toBe('18 C');
    expect(state.items[0]?.title).toBe('None');
    expect(state.items[0]?.summary).toBe('18 C');
    expect(state.items[0]?.detail).toBe('None');
  });

  it('falls back to None when template paths or expressions are missing', () => {
    const config = createJsonConfig({
      fieldMappings: {
        title: 'headline',
        summary: 'Status {{ $data.status_code }}',
        detail: '{{ $data.missing.value.toFixed(2) }}',
      },
    });
    const state = normalizeSourceState(config, {
      fetchedAtMs: 1710000000000,
      payload: {},
      items: [{ headline: 'Unknown' }],
    });

    expect(state.summary.title).toBe('Unknown');
    expect(state.summary.text).toBe('Status');
    expect(state.items[0]?.detail).toBe('None');
  });

  it('blocks unsafe expressions and preserves fallback behavior', () => {
    const config = createJsonConfig({
      fieldMappings: {
        title: 'headline',
        summary: '{{ globalThis.process }}',
        detail: '{{ $data.constructor.constructor("return process")() }}',
      },
    });
    const state = normalizeSourceState(config, {
      fetchedAtMs: 1710000000000,
      payload: { summary: 'safe' },
      items: [{ headline: 'Unknown' }],
    });

    expect(state.summary.title).toBe('Unknown');
    expect(state.summary.text).toBe('None');
    expect(state.items[0]?.detail).toBe('None');
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
