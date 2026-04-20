import Parser from 'rss-parser';

import { APP_CONFIG } from '../../../shared/constants/config';
import type { SourceConfig } from '../../../shared/types/config';
import type { SourceFetchResult, SourceFetcher } from './types';
import { logger as baseLogger } from '../logger';

type RssItemRecord = {
  title?: string;
  contentSnippet?: string;
  content?: string;
  isoDate?: string;
  link?: string;
};

export class RssSource implements SourceFetcher {
  private readonly logger = baseLogger.scope('sources:rss');

  async fetch(config: SourceConfig): Promise<SourceFetchResult> {
    const parser = new Parser({ timeout: APP_CONFIG.polling.requestTimeoutMs });
    const feed = await parser.parseURL(config.url);
    const items: RssItemRecord[] = feed.items.map((item) => ({
      title: item.title,
      contentSnippet: item.contentSnippet,
      content: item.content,
      isoDate: item.isoDate,
      link: item.link,
    }));

    this.logger.debug('Fetched RSS source', {
      sourceId: config.id,
      itemCount: items.length,
    });

    return {
      items,
      fetchedAtMs: Date.now(),
    };
  }
}
