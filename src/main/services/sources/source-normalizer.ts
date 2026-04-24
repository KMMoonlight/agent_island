import { APP_CONFIG } from '../../../shared/constants/config';
import type { SourceConfig } from '../../../shared/types/config';
import type { OverlayItem, SourceState } from '../../../shared/types/source-data';

import { getValueAtPath } from '../../utils/path-value';
import { parseTimestampToMillis } from '../../utils/time';

import type { SourceFetchResult } from './types';

const TEMPLATE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const DIRECT_DATA_PATH_PATTERN = /^\$data(?:\.[A-Za-z_$][\w$]*)*$/;
const DATA_REFERENCE_PATTERN = /\$data(?:\b|[.\[])/;
const BLOCKED_EXPRESSION_PATTERN = /(?:^|[^\w$])(constructor|prototype|__proto__|globalThis|window|document|process|require|Function|eval|import|export|this)(?:[^\w$]|$)|;|=>/;
const ASSIGNMENT_PATTERN = /(^|[^=!<>])=([^=]|$)/;
const PATH_LIKE_MAPPING_PATTERN = /^(?:[a-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*$/;
const NONE_FALLBACK = 'None';

function resolveTemplatePath(path: string, context: Record<string, unknown>): string | undefined {
  const normalizedPath = path.replace(/^\$data\.?/, '');

  if (normalizedPath.length === 0) {
    const value = context.$data;
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return undefined;
  }

  return getValueAtPath(context.$data, normalizedPath);
}

function stringifyResolvedValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
}

function isBlockedExpression(expression: string): boolean {
  return BLOCKED_EXPRESSION_PATTERN.test(expression) || ASSIGNMENT_PATTERN.test(expression);
}

function evaluateTemplateExpression(expression: string, context: Record<string, unknown>): string | undefined {
  if (DIRECT_DATA_PATH_PATTERN.test(expression)) {
    return resolveTemplatePath(expression, context);
  }

  if (!DATA_REFERENCE_PATTERN.test(expression) || isBlockedExpression(expression)) {
    return undefined;
  }

  try {
    const evaluator = new Function('$data', `"use strict"; return (${expression});`);
    return stringifyResolvedValue(evaluator(context.$data));
  } catch {
    return undefined;
  }
}

function isPathLikeMapping(mapping: string): boolean {
  return PATH_LIKE_MAPPING_PATTERN.test(mapping.trim());
}

function resolveMappingValue(
  mapping: string | undefined,
  item: unknown,
  payload: unknown,
  options: { allowLiteralFallback?: boolean } = {}
): string | undefined {
  if (!mapping) {
    return undefined;
  }

  if (!mapping.includes('{{')) {
    const resolvedPathValue = getValueAtPath(item, mapping);
    if (resolvedPathValue) {
      return resolvedPathValue;
    }

    const resolvedPayloadValue = getValueAtPath(payload, mapping);
    if (resolvedPayloadValue) {
      return resolvedPayloadValue;
    }

    if (options.allowLiteralFallback && !isPathLikeMapping(mapping)) {
      const trimmedLiteral = mapping.trim();
      return trimmedLiteral.length > 0 ? trimmedLiteral : undefined;
    }

    return undefined;
  }

  const context = { $data: payload ?? item };
  let usedTemplate = false;
  const resolved = mapping.replace(TEMPLATE_PATTERN, (_match, rawExpression: string) => {
    usedTemplate = true;
    const expression = rawExpression.trim();

    return evaluateTemplateExpression(expression, context) ?? '';
  });

  if (!usedTemplate) {
    return getValueAtPath(item, mapping);
  }

  const trimmed = resolved.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getFieldOrNone(value: string | undefined, fallback?: string): string {
  const trimmedValue = value?.trim();

  if (trimmedValue && trimmedValue.length > 0) {
    return trimmedValue;
  }

  if (fallback) {
    const trimmedFallback = fallback.trim();
    if (trimmedFallback.length > 0) {
      return trimmedFallback;
    }
  }

  return NONE_FALLBACK;
}

function getDetailCount(config: SourceConfig): number {
  return config.detailItemCount ?? APP_CONFIG.detailItemDefaults.json;
}

function getItemClickTarget(config: SourceConfig, item: unknown, payload: unknown): string | undefined {
  const mappedTarget = resolveMappingValue(config.fieldMappings.target, item, payload);

  if (mappedTarget) {
    return mappedTarget;
  }

  return config.clickTarget?.item ?? config.clickTarget?.source;
}

function createOverlayItem(config: SourceConfig, item: unknown, index: number, payload: unknown): OverlayItem {
  const titleValue = resolveMappingValue(config.fieldMappings.title, item, payload, { allowLiteralFallback: true });
  const summaryValue = resolveMappingValue(config.fieldMappings.summary, item, payload, { allowLiteralFallback: true });
  const detailValue = resolveMappingValue(config.fieldMappings.detail, item, payload, { allowLiteralFallback: true });
  const timestampValue = resolveMappingValue(config.fieldMappings.timestamp, item, payload);
  const icon = resolveMappingValue(config.fieldMappings.icon, item, payload) ?? config.icon;

  return {
    id: `${config.id}-${index}`,
    title: getFieldOrNone(titleValue),
    summary: getFieldOrNone(summaryValue),
    detail: getFieldOrNone(detailValue),
    timestampMs: parseTimestampToMillis(timestampValue),
    icon,
    clickTarget: getItemClickTarget(config, item, payload),
  };
}

export function createEmptySourceState(config: SourceConfig): SourceState {
  return {
    id: config.id,
    name: config.name,
    type: 'json',
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
  const items = result.items
    .slice(0, getDetailCount(config))
    .map((item, index) => createOverlayItem(config, item, index, result.payload));
  const firstItem = items[0];

  return {
    id: config.id,
    name: config.name,
    type: 'json',
    icon: config.icon,
    status: 'ready',
    summary: {
      title: firstItem?.title ?? config.name,
      text: firstItem?.summary ?? NONE_FALLBACK,
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
