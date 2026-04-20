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

  start(): void {
    const config = this.configService.getConfig();
    this.applyConfig(config);
  }

  reload(): void {
    const config = this.configService.reloadConfig();
    this.applyConfig(config);
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }

    this.timers.clear();
  }

  private applyConfig(config: AppConfig): void {
    this.stop();
    this.sourceStore.initialize(config);

    for (const source of config.sources) {
      void this.refreshSource(source);
      const timer = setInterval(() => {
        void this.refreshSource(source);
      }, source.refreshIntervalMs);
      this.timers.set(source.id, timer);
    }
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
