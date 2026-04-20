import { APP_CONFIG } from '../../../shared/constants/config';
import type { SourceConfig } from '../../../shared/types/config';
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
  return new Error(`JSON source request timed out after ${APP_CONFIG.polling.requestTimeoutMs}ms: ${config.url}`);
}

export class JsonSource implements SourceFetcher {
  private readonly logger = baseLogger.scope('sources:json');

  async fetch(config: SourceConfig): Promise<SourceFetchResult> {
    try {
      const response = await fetch(config.url, {
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
      });

      return {
        items,
        fetchedAtMs: Date.now(),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw createJsonTimeoutError(config);
      }

      throw error;
    }
  }
}
