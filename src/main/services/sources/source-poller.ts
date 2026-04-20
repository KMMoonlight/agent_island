import { logger as baseLogger } from '../logger';
import type { ConfigService } from '../config/config-service';
import type { SourceStore } from '../state/source-store';

import {
  markSourceLoading,
  normalizeSourceState,
  withSourceError,
} from './source-normalizer';
import { SourceRegistry } from './source-registry';

import type { AppConfig, SourceConfig } from '../../../shared/types/config';

export class SourcePoller {
  private readonly logger = baseLogger.scope('sources:poller');

  private readonly registry = new SourceRegistry();

  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly configService: ConfigService,
    private readonly sourceStore: SourceStore
  ) {}

  async start(): Promise<void> {
    const config = this.configService.getConfig();
    await this.applyConfig(config);
  }

  async reload(): Promise<void> {
    const config = this.configService.reloadConfig();
    await this.applyConfig(config);
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }

    this.timers.clear();
  }

  private async applyConfig(config: AppConfig): Promise<void> {
    this.stop();
    this.sourceStore.initialize(config);

    await Promise.all(config.sources.map(async (source) => {
      await this.refreshSource(source);
      const timer = setInterval(() => {
        void this.refreshSource(source);
      }, source.refreshIntervalMs);
      this.timers.set(source.id, timer);
    }));
  }

  private async refreshSource(config: SourceConfig): Promise<void> {
    this.sourceStore.updateSource(markSourceLoading(config, this.sourceStore.getSourceState(config.id)));

    try {
      const result = await this.registry.fetch(config);
      const nextState = normalizeSourceState(config, result);
      this.sourceStore.updateSource(nextState);
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('Unknown source error');
      this.logger.error('Source refresh failed', {
        sourceId: config.id,
        message: normalizedError.message,
      });
      this.sourceStore.updateSource(
        withSourceError(config, this.sourceStore.getSourceState(config.id), normalizedError)
      );
    }
  }
}
