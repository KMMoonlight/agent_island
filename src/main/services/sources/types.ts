import type { SourceConfig } from '../../../shared/types/config';

export type SourceFetchResult = {
  items: ReadonlyArray<unknown>;
  fetchedAtMs: number;
};

export type SourceFetcher = {
  fetch: (config: SourceConfig) => Promise<SourceFetchResult>;
};
