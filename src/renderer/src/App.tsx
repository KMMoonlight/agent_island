import { useEffect, useMemo, useState } from 'react';

import type { SourceState } from '@shared/types/source-data';

import { OverlayProvider } from './features/overlay/context/OverlayContext';
import { useOverlayContext } from './features/overlay/context/overlay-context';
import { IslandCompact } from './features/overlay/components/IslandCompact';
import { IslandExpanded } from './features/overlay/components/IslandExpanded';

function PlaceholderState({ message }: { message: string }): JSX.Element {
  return (
    <>
      <span className="island__icon" aria-hidden="true">
        DI
      </span>
      <div className="island__content">
        <p className="island__eyebrow">Dynamic Island</p>
        <p className="island__title">{message}</p>
      </div>
    </>
  );
}

function getIslandContent(
  isLoading: boolean,
  state: ReturnType<typeof useOverlayContext>['state'],
  loadError: string | null,
  activeSource: SourceState | null,
  isExpanded: boolean,
  handleOpenTarget: (targetUrl: string | undefined) => Promise<void>,
  reloadConfig: () => Promise<void>
): JSX.Element {
  if (isLoading && !state) {
    return <PlaceholderState message="Loading configured sources" />;
  }

  if (!isLoading && loadError) {
    return <PlaceholderState message={loadError} />;
  }

  if (!isLoading && !loadError && state && isExpanded) {
    return <IslandExpanded state={state} onOpenTarget={handleOpenTarget} onReloadConfig={reloadConfig} />;
  }

  if (!isLoading && !loadError && state && activeSource) {
    return <IslandCompact source={activeSource} />;
  }

  return <PlaceholderState message="No sources configured" />;
}

function useActiveSource(sources: SourceState[], rotationIntervalMs: number): SourceState | null {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [sources.length]);

  useEffect(() => {
    if (sources.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % sources.length);
    }, rotationIntervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [sources.length, rotationIntervalMs]);

  return sources[activeIndex] ?? null;
}

function OverlayApp(): JSX.Element {
  const { state, isLoading, loadError, reloadConfig } = useOverlayContext();
  const [isExpanded, setIsExpanded] = useState(false);

  const sources = state?.sources ?? [];
  const rotationIntervalMs = state?.rotationIntervalMs ?? 10_000;
  const activeSource = useActiveSource(sources, rotationIntervalMs);

  const overlayClassName = useMemo(
    () => `overlay-shell${isExpanded ? ' overlay-shell--expanded' : ''}`,
    [isExpanded]
  );
  const islandClassName = useMemo(() => {
    const modeClassName = isExpanded ? 'island--expanded' : 'island--compact';
    const placeholderClassName = !state || loadError || !activeSource ? ' island--placeholder' : '';

    return `island ${modeClassName}${placeholderClassName}`;
  }, [activeSource, isExpanded, loadError, state]);

  const handleOpenTarget = async (targetUrl: string | undefined): Promise<void> => {
    if (!targetUrl) {
      return;
    }

    await window.api.app.openTarget(targetUrl);
  };

  const syncWindowMode = (expanded: boolean): void => {
    setIsExpanded(expanded);
    void window.api.app.setOverlayExpanded(expanded);
  };

  return (
    <main
      className={overlayClassName}
      onMouseEnter={() => {
        syncWindowMode(true);
      }}
      onMouseLeave={() => {
        syncWindowMode(false);
      }}
    >
      <section
        className={islandClassName}
        aria-live="polite"
        aria-label={isExpanded ? 'Dynamic island expanded details' : 'Dynamic island compact summary'}
      >
        {getIslandContent(isLoading, state, loadError, activeSource, isExpanded, handleOpenTarget, reloadConfig)}
      </section>
    </main>
  );
}

function App(): JSX.Element {
  return (
    <OverlayProvider>
      <OverlayApp />
    </OverlayProvider>
  );
}

export default App;
