import { useEffect, useMemo, useRef, useState } from 'react';

import { APP_CONFIG } from '@shared/constants/config';
import type { SourceState } from '@shared/types/source-data';

import { OverlayProvider } from './features/overlay/context/OverlayContext';
import { useOverlayContext } from './features/overlay/context/overlay-context';
import { IslandCompact } from './features/overlay/components/IslandCompact';
import { IslandExpanded } from './features/overlay/components/IslandExpanded';

type OverlayPresentationMode = 'compact' | 'expanding' | 'expanded' | 'collapsing';

function PlaceholderState({ message }: { message: string }): JSX.Element {
  return (
    <div className="island__compact-row island__compact-row--placeholder">
      <span className="island__icon" aria-hidden="true">
        DI
      </span>
      <div className="island__content">
        <p className="island__eyebrow">Dynamic Island</p>
        <p className="island__title">{message}</p>
      </div>
    </div>
  );
}

function getStableCompactContent(
  isLoading: boolean,
  state: ReturnType<typeof useOverlayContext>['state'],
  loadError: string | null,
  activeSource: SourceState | null
): JSX.Element {
  if (isLoading && !state) {
    return <PlaceholderState message="Loading configured sources" />;
  }

  if (!isLoading && loadError) {
    return <PlaceholderState message={loadError} />;
  }

  if (!isLoading && !loadError && state && activeSource) {
    return (
      <div className="island__compact-row">
        <IslandCompact source={activeSource} />
      </div>
    );
  }

  return <PlaceholderState message="No sources configured" />;
}

function shouldShowExpandedBody(
  isLoading: boolean,
  state: ReturnType<typeof useOverlayContext>['state'],
  loadError: string | null
): boolean {
  return !isLoading && !loadError && Boolean(state);
}

function getExpandedBody(
  state: ReturnType<typeof useOverlayContext>['state'],
  handleOpenTarget: (targetUrl: string | undefined) => Promise<void>,
  reloadConfig: () => Promise<void>
): JSX.Element | null {
  if (!state) {
    return null;
  }

  return <IslandExpanded state={state} onOpenTarget={handleOpenTarget} onReloadConfig={reloadConfig} />;
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
  const [presentationMode, setPresentationMode] = useState<OverlayPresentationMode>('compact');
  const [isShellAnimating, setIsShellAnimating] = useState(false);
  const expandTimerRef = useRef<number | null>(null);
  const collapseTimerRef = useRef<number | null>(null);
  const shellAnimationTimerRef = useRef<number | null>(null);

  const sources = state?.sources ?? [];
  const rotationIntervalMs = state?.rotationIntervalMs ?? 10_000;
  const activeSource = useActiveSource(sources, rotationIntervalMs);

  const handleOpenTarget = async (targetUrl: string | undefined): Promise<void> => {
    if (!targetUrl) {
      return;
    }

    await window.api.app.openTarget(targetUrl);
  };

  const stableCompactContent = getStableCompactContent(isLoading, state, loadError, activeSource);
  const hasExpandedBody = shouldShowExpandedBody(isLoading, state, loadError);
  const expandedBody = getExpandedBody(state, handleOpenTarget, reloadConfig);
  const isExpandedVisual = presentationMode === 'expanding' || presentationMode === 'expanded';
  const keepsDetailVisible = presentationMode !== 'compact';

  const overlayClassName = useMemo(() => {
    const expandedClassName = isExpandedVisual ? ' overlay-shell--expanded' : '';
    const animatingClassName = isShellAnimating ? ' overlay-shell--animating' : '';

    return `overlay-shell${expandedClassName}${animatingClassName}`;
  }, [isExpandedVisual, isShellAnimating]);

  const islandClassName = useMemo(() => {
    const phaseClassName = ` island--${presentationMode}`;
    const placeholderClassName = !state || loadError || !activeSource ? ' island--placeholder' : '';
    const animatingClassName = isShellAnimating ? ' island--animating' : '';

    return `island${phaseClassName}${placeholderClassName}${animatingClassName}`;
  }, [activeSource, isShellAnimating, loadError, presentationMode, state]);

  const clearHoverTimer = (timerRef: React.MutableRefObject<number | null>): void => {
    const timer = timerRef.current;

    if (timer === null) {
      return;
    }

    window.clearTimeout(timer);
    timerRef.current = null;
  };

  const clearShellAnimationTimer = (): void => {
    const timer = shellAnimationTimerRef.current;

    if (timer === null) {
      return;
    }

    window.clearTimeout(timer);
    shellAnimationTimerRef.current = null;
  };

  const syncWindowMode = (expanded: boolean): void => {
    clearShellAnimationTimer();
    setIsShellAnimating(true);
    setPresentationMode(expanded ? 'expanding' : 'collapsing');
    void window.api.app.setOverlayExpanded(expanded);

    shellAnimationTimerRef.current = window.setTimeout(() => {
      shellAnimationTimerRef.current = null;
      setIsShellAnimating(false);
      setPresentationMode(expanded ? 'expanded' : 'compact');
    }, expanded ? APP_CONFIG.window.expandTransitionMs : APP_CONFIG.window.collapseTransitionMs);
  };

  const scheduleExpand = (): void => {
    clearHoverTimer(collapseTimerRef);

    if (isExpandedVisual || expandTimerRef.current !== null) {
      return;
    }

    expandTimerRef.current = window.setTimeout(() => {
      expandTimerRef.current = null;
      syncWindowMode(true);
    }, APP_CONFIG.window.expandHoverDelayMs);
  };

  const scheduleCollapse = (): void => {
    clearHoverTimer(expandTimerRef);

    if (!isExpandedVisual || collapseTimerRef.current !== null) {
      return;
    }

    collapseTimerRef.current = window.setTimeout(() => {
      collapseTimerRef.current = null;
      syncWindowMode(false);
    }, APP_CONFIG.window.collapseHoverDelayMs);
  };

  useEffect(() => {
    return () => {
      clearHoverTimer(expandTimerRef);
      clearHoverTimer(collapseTimerRef);
      clearShellAnimationTimer();
    };
  }, []);

  return (
    <main
      className={overlayClassName}
      onMouseEnter={() => {
        scheduleExpand();
      }}
      onMouseLeave={() => {
        scheduleCollapse();
      }}
    >
      <section
        className={islandClassName}
        aria-live="polite"
        aria-label={isExpandedVisual ? 'Dynamic island expanded details' : 'Dynamic island compact summary'}
      >
        <div className="island__compact-layer">{stableCompactContent}</div>
        <div
          className={`island__detail-layer${keepsDetailVisible ? ' island__detail-layer--visible' : ''}${
            hasExpandedBody ? ' island__detail-layer--ready' : ' island__detail-layer--empty'
          }`}
          aria-hidden={!isExpandedVisual}
        >
          {expandedBody}
        </div>
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
