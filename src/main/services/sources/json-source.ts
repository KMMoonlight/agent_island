import { APP_CONFIG } from '../../../shared/constants/config';
import type { RequestEntry, SourceConfig } from '../../../shared/types/config';
import type { SourceFetchResult, SourceFetcher } from './types';
import { logger as baseLogger } from '../logger';

function toJsonItems(payload: unknown): ReadonlyArray<unknown> {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    const values = Object.values(record);
    const firstArray = values.find((value) => Array.isArray(value));

    if (Array.isArray(firstArray)) {
      return firstArray;
    }

    return [record];
  }

  return [{ value: payload }];
}

function createJsonTimeoutError(config: SourceConfig): Error {
  return new Error(
    `JSON source request timed out after ${APP_CONFIG.polling.requestTimeoutMs}ms: ${config.request.url}`
  );
}

function applyEntries(url: URL, entries: RequestEntry[]): void {
  for (const entry of entries) {
    url.searchParams.append(entry.key, entry.value);
  }
}

function createHeaders(entries: RequestEntry[]): Headers {
  const headers = new Headers();

  for (const entry of entries) {
    headers.append(entry.key, entry.value);
  }

  if (!headers.has('accept')) {
    headers.set('accept', 'application/json, text/plain, */*');
  }

  return headers;
}

function shouldSendBody(method: SourceConfig['request']['method']): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH';
}

export class JsonSource implements SourceFetcher {
  private readonly logger = baseLogger.scope('sources:json');

  async fetch(config: SourceConfig): Promise<SourceFetchResult> {
    const requestUrl = new URL(config.request.url);
    applyEntries(requestUrl, config.request.params);
    const headers = createHeaders(config.request.headers);
    const body = shouldSendBody(config.request.method) ? config.request.body?.trim() : undefined;

    if (body && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    try {
      const response = await fetch(requestUrl, {
        method: config.request.method,
        headers,
        body,
        signal: AbortSignal.timeout(APP_CONFIG.polling.requestTimeoutMs),
      });

      if (!response.ok) {
        throw new Error(`JSON source request failed with ${response.status}`);
      }

      const payload: unknown = await response.json();
      const items = toJsonItems(payload);

      this.logger.debug('Fetched JSON source', {
        sourceId: config.id,
        itemCount: items.length,
        method: config.request.method,
      });

      return {
        items,
        fetchedAtMs: Date.now(),
        payload,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw createJsonTimeoutError(config);
      }

      throw error;
    }
  }
}
