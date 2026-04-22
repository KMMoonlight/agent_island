import { useEffect, useMemo, useRef, useState } from 'react';

import { APP_CONFIG } from '@shared/constants/config';
import type { OverlayHostKind } from '@shared/types/ipc';
import type { SourceState } from '@shared/types/source-data';

import { OverlayProvider } from './features/overlay/context/OverlayContext';
import { useOverlayContext } from './features/overlay/context/overlay-context';
import { IslandCompact, PixelCompactIcon, type PixelCompactIconVariant } from './features/overlay/components/IslandCompact';
import { IslandExpanded } from './features/overlay/components/IslandExpanded';

type OverlayPresentationMode = 'compact' | 'expanding' | 'expanded' | 'collapsing';

function IslandShapeDefs(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width="0"
      height="0"
      style={{ position: 'absolute', pointerEvents: 'none' }}
    >
      <defs>
        <clipPath id="island-shape-compact" clipPathUnits="objectBoundingBox">
          <path d="M 0 0 Q 0.01596 0 0.01596 0.1875 L 0.01596 0.375 Q 0.01596 1 0.06915 1 L 0.93085 1 Q 0.98404 1 0.98404 0.375 L 0.98404 0.1875 Q 0.98404 0 1 0 Z" />
        </clipPath>
        <clipPath id="island-shape-expanded" clipPathUnits="objectBoundingBox">
          <path d="M 0 0 Q 0.03667 0 0.03667 0.06111 L 0.03667 0.9 Q 0.03667 1 0.09667 1 L 0.90333 1 Q 0.96333 1 0.96333 0.9 L 0.96333 0.06111 Q 0.96333 0 1 0 Z" />
        </clipPath>
      </defs>
    </svg>
  );
}

function PlaceholderState({
  message,
  iconOnly = false,
  iconVariant = 'info',
}: {
  message: string;
  iconOnly?: boolean;
  iconVariant?: PixelCompactIconVariant;
}): JSX.Element {
  return (
    <div className="island__compact-row island__compact-row--placeholder">
      <PixelCompactIcon variant={iconVariant} />
      {iconOnly ? null : (
        <div className="island__content island__content--compact">
          <p className="island__title island__title--inline">{message}</p>
        </div>
      )}
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
    return <PlaceholderState message="Loading configured sources" iconVariant="sync" />;
  }

  if (!isLoading && loadError) {
    return <PlaceholderState message={loadError} iconVariant="warn" />;
  }

  if (!isLoading && !loadError && state && activeSource) {
    return (
      <div className="island__compact-row">
        <IslandCompact source={activeSource} />
      </div>
    );
  }

  return <PlaceholderState message="No sources configured" iconOnly iconVariant="info" />;
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
  refreshSources: () => Promise<void>
): JSX.Element | null {
  if (!state) {
    return null;
  }

  return <IslandExpanded state={state} onOpenTarget={handleOpenTarget} onRefreshSources={refreshSources} />;
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
  const { state, isLoading, loadError, refreshSources } = useOverlayContext();
  const [overlayHostKind, setOverlayHostKind] = useState<OverlayHostKind | null>(null);
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
  const expandedBody = getExpandedBody(state, handleOpenTarget, refreshSources);
  const isExpandedVisual = presentationMode === 'expanding' || presentationMode === 'expanded';
  const keepsDetailVisible = presentationMode !== 'compact';

  const overlayClassName = useMemo(() => {
    const expandedClassName = isExpandedVisual ? ' overlay-shell--expanded' : '';
    const animatingClassName = isShellAnimating ? ' overlay-shell--animating' : '';
    const hostClassName = overlayHostKind === null ? '' : ` overlay-shell--${overlayHostKind}`;

    return `overlay-shell${expandedClassName}${animatingClassName}${hostClassName}`;
  }, [isExpandedVisual, isShellAnimating, overlayHostKind]);

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
    let isCancelled = false;

    void window.api.app.getStatus().then((status) => {
      if (isCancelled) {
        return;
      }

      setOverlayHostKind(status.overlayHostKind);
    }).catch(() => {
      if (!isCancelled) {
        setOverlayHostKind(null);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      clearHoverTimer(expandTimerRef);
      clearHoverTimer(collapseTimerRef);
      clearShellAnimationTimer();
    };
  }, []);

  useEffect(() => {
    return window.api.app.subscribeOverlayMode((mode) => {
      clearHoverTimer(expandTimerRef);
      clearHoverTimer(collapseTimerRef);
      clearShellAnimationTimer();
      setIsShellAnimating(true);

      const nextMode = mode === 'expanded' ? 'expanding' : 'collapsing';
      const finalMode = mode === 'expanded' ? 'expanded' : 'compact';
      const durationMs = mode === 'expanded'
        ? APP_CONFIG.window.expandTransitionMs
        : APP_CONFIG.window.collapseTransitionMs;

      setPresentationMode(nextMode);
      shellAnimationTimerRef.current = window.setTimeout(() => {
        shellAnimationTimerRef.current = null;
        setIsShellAnimating(false);
        setPresentationMode(finalMode);
      }, durationMs);
    });
  }, []);

  return (
    <>
      <IslandShapeDefs />
      <main
        className={overlayClassName}
        data-host-kind={overlayHostKind ?? 'unknown'}
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
    </>
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
