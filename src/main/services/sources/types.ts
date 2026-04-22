import type { SourceConfig } from '../../../shared/types/config';

export type SourceFetchResult = {
  items: ReadonlyArray<unknown>;
  fetchedAtMs: number;
  payload?: unknown;
};

export type SourceFetcher = {
  fetch: (config: SourceConfig) => Promise<SourceFetchResult>;
};
