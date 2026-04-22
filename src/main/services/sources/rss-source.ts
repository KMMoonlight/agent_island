import type { SourceFetchResult, SourceFetcher } from './types';

export class RssSource implements SourceFetcher {
  async fetch(): Promise<SourceFetchResult> {
    throw new Error('RSS sources are no longer supported');
  }
}
