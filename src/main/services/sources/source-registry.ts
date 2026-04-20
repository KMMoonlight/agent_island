import { JsonSource } from './json-source';
import { RssSource } from './rss-source';
import type { SourceFetcher, SourceFetchResult } from './types';

import type { SourceConfig } from '../../../shared/types/config';

export class SourceRegistry {
  private readonly jsonSource = new JsonSource();

  private readonly rssSource = new RssSource();

  getFetcher(config: SourceConfig): SourceFetcher {
    switch (config.type) {
      case 'json': {
        return this.jsonSource;
      }
      case 'rss': {
        return this.rssSource;
      }
      default: {
        const _exhaustive: never = config.type;
        throw new Error(`Unsupported source type: ${String(_exhaustive)}`);
      }
    }
  }

  async fetch(config: SourceConfig): Promise<SourceFetchResult> {
    return this.getFetcher(config).fetch(config);
  }
}
