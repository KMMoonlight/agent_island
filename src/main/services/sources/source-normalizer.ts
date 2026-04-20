import { APP_CONFIG } from '../../../shared/constants/config';
import type { SourceConfig } from '../../../shared/types/config';
import type { OverlayItem, SourceState } from '../../../shared/types/source-data';

import { getValueAtPath } from '../../utils/path-value';
import { parseTimestampToMillis } from '../../utils/time';

import type { SourceFetchResult } from './types';

function getDetailCount(config: SourceConfig): number {
  return config.detailItemCount ?? APP_CONFIG.detailItemDefaults[config.type];
}

function getItemClickTarget(config: SourceConfig, item: unknown): string | undefined {
  const mappedTarget = getValueAtPath(item, config.fieldMappings.target);

  if (mappedTarget) {
    return mappedTarget;
  }

  return config.clickTarget?.item ?? config.clickTarget?.source;
}

function createOverlayItem(config: SourceConfig, item: unknown, index: number): OverlayItem {
  const title = getValueAtPath(item, config.fieldMappings.title) ?? `${config.name} ${index + 1}`;
  const summary = getValueAtPath(item, config.fieldMappings.summary);
  const detail = getValueAtPath(item, config.fieldMappings.detail) ?? summary;
  const timestampValue = getValueAtPath(item, config.fieldMappings.timestamp);
  const icon = getValueAtPath(item, config.fieldMappings.icon) ?? config.icon;

  return {
    id: `${config.id}-${index}`,
    title,
    summary,
    detail,
    timestampMs: parseTimestampToMillis(timestampValue),
    icon,
    clickTarget: getItemClickTarget(config, item),
  };
}

export function createEmptySourceState(config: SourceConfig): SourceState {
  return {
    id: config.id,
    name: config.name,
    type: config.type,
    icon: config.icon,
    status: 'idle',
    summary: {
      title: config.name,
      text: 'Waiting for first update',
    },
    items: [],
    lastFetchedAtMs: null,
    lastError: null,
  };
}

export function markSourceLoading(config: SourceConfig, currentState: SourceState | undefined): SourceState {
  const fallback = currentState ?? createEmptySourceState(config);

  return {
    ...fallback,
    status: fallback.items.length > 0 ? fallback.status : 'loading',
  };
}

export function normalizeSourceState(config: SourceConfig, result: SourceFetchResult): SourceState {
  const items = result.items.slice(0, getDetailCount(config)).map((item, index) => createOverlayItem(config, item, index));
  const firstItem = items[0];

  return {
    id: config.id,
    name: config.name,
    type: config.type,
    icon: config.icon,
    status: 'ready',
    summary: {
      title: firstItem?.title ?? config.name,
      text: firstItem?.summary ?? firstItem?.detail ?? 'No details available',
    },
    items,
    lastFetchedAtMs: result.fetchedAtMs,
    lastError: null,
  };
}

export function withSourceError(config: SourceConfig, currentState: SourceState | undefined, error: Error): SourceState {
  const fallback = currentState ?? createEmptySourceState(config);

  return {
    ...fallback,
    status: 'error',
    lastError: {
      message: error.message,
      timestampMs: Date.now(),
    },
  };
}
