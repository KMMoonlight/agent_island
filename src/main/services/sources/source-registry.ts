import { JsonSource } from './json-source';
import type { SourceFetchResult } from './types';

import type { SourceConfig } from '../../../shared/types/config';

export class SourceRegistry {
  private readonly jsonSource = new JsonSource();

  async fetch(config: SourceConfig): Promise<SourceFetchResult> {
    return this.jsonSource.fetch(config);
  }
}
