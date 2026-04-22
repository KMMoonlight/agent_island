import { APP_CONFIG } from '../../../shared/constants/config';
import type { AppConfig } from '../../../shared/types/config';
import type { AppStatus, OverlayHostKind } from '../../../shared/types/ipc';
import type { OverlayState, SourceState } from '../../../shared/types/source-data';

import { createEmptySourceState } from '../sources/source-normalizer';

type StoreListener = (state: OverlayState) => void;

function cloneState(state: OverlayState): OverlayState {
  return {
    ...state,
    sources: state.sources.map((source) => ({
      ...source,
      summary: { ...source.summary },
      items: source.items.map((item) => ({ ...item })),
      lastError: source.lastError ? { ...source.lastError } : null,
    })),
  };
}

export class SourceStore {
  private state: OverlayState = {
    rotationIntervalMs: APP_CONFIG.rotationIntervalMs,
    sources: [],
    updatedAtMs: Date.now(),
    hasErrors: false,
  };

  private overlayHostKind: OverlayHostKind = 'browser-window';

  private readonly listeners = new Set<StoreListener>();

  initialize(config: AppConfig): void {
    this.state = {
      rotationIntervalMs: config.rotationIntervalMs,
      sources: config.sources.map((source) => createEmptySourceState(source)),
      updatedAtMs: Date.now(),
      hasErrors: false,
    };

    this.emit();
  }

  setOverlayHostKind(overlayHostKind: OverlayHostKind): void {
    this.overlayHostKind = overlayHostKind;
  }

  getState(): OverlayState {
    return cloneState(this.state);
  }

  getSourceState(sourceId: string): SourceState | undefined {
    return this.state.sources.find((source) => source.id === sourceId);
  }

  getStatus(): AppStatus {
    return {
      hasErrors: this.state.hasErrors,
      sourceCount: this.state.sources.length,
      updatedAtMs: this.state.updatedAtMs,
      overlayHostKind: this.overlayHostKind,
    };
  }

  updateSource(nextSource: SourceState): void {
    const sources = this.state.sources.map((source) => (source.id === nextSource.id ? nextSource : source));

    this.state = {
      ...this.state,
      sources,
      updatedAtMs: Date.now(),
      hasErrors: sources.some((source) => source.status === 'error'),
    };

    this.emit();
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.getState();

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
