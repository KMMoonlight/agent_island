import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { APP_CONFIG } from '@shared/constants/config';
import type { AgentApprovalDecision, AgentReminder } from '@shared/types/agent-hook';
import type { OverlayHostKind } from '@shared/types/ipc';
import type { SourceState } from '@shared/types/source-data';

import { OverlayProvider } from './features/overlay/context/OverlayContext';
import { useOverlayContext } from './features/overlay/context/overlay-context';
import { IslandCompact, PixelCompactIcon, type PixelCompactIconVariant } from './features/overlay/components/IslandCompact';
import { IslandExpanded } from './features/overlay/components/IslandExpanded';

type OverlayPresentationMode = 'compact' | 'expanding' | 'expanded' | 'collapsing';

type IslandVisualSize = {
  width: number;
  height: number;
};

type IslandCurveProfile = {
  topInset: number;
  topDepth: number;
  bottomInset: number;
  bottomDepth: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function interpolateNumber(start: number, end: number, progress: number): number {
  return start + ((end - start) * progress);
}

function getCompactCurveProfile(): IslandCurveProfile {
  return {
    topInset: APP_CONFIG.window.compactWidth * 0.11,
    topDepth: APP_CONFIG.window.compactHeight * 0.3125,
    bottomInset: APP_CONFIG.window.compactWidth * 0.135,
    bottomDepth: APP_CONFIG.window.compactHeight * 0.3125,
  };
}

function getExpandedCurveProfile(height: number): IslandCurveProfile {
  const safeHeight = Math.max(1, height);
  const scale = Math.min(1, safeHeight / 58);

  return {
    topInset: 22 * scale,
    topDepth: 22 * scale,
    bottomInset: 58 * scale,
    bottomDepth: 36 * scale,
  };
}

function getIslandMorphProgress(width: number): number {
  const widthRange = APP_CONFIG.window.expandedWidth - APP_CONFIG.window.compactWidth;
  if (widthRange <= 0) {
    return 1;
  }

  return clamp01((width - APP_CONFIG.window.compactWidth) / widthRange);
}

function buildIslandPath(width: number, height: number, morphProgress: number): string {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const progress = clamp01(morphProgress);
  const easedCornerProgress = Math.pow(progress, 0.72);
  const compactCurve = getCompactCurveProfile();
  const expandedCurve = getExpandedCurveProfile(safeHeight);
  const topInset = interpolateNumber(compactCurve.topInset, expandedCurve.topInset, progress);
  const topDepth = interpolateNumber(compactCurve.topDepth, expandedCurve.topDepth, easedCornerProgress);
  const bottomInset = interpolateNumber(compactCurve.bottomInset, expandedCurve.bottomInset, easedCornerProgress);
  const animatedBottomDepth = interpolateNumber(compactCurve.bottomDepth, expandedCurve.bottomDepth, easedCornerProgress);
  const bottomDepth = Math.max(animatedBottomDepth, safeHeight * 0.18);
  const rightTopInset = safeWidth - topInset;
  const rightBottomInset = safeWidth - bottomInset;
  const bottomStartY = Math.max(topDepth, safeHeight - bottomDepth);

  return [
    `M 0 0`,
    `Q ${topInset} 0 ${topInset} ${topDepth}`,
    `L ${topInset} ${bottomStartY}`,
    `Q ${topInset} ${safeHeight} ${bottomInset} ${safeHeight}`,
    `L ${rightBottomInset} ${safeHeight}`,
    `Q ${rightTopInset} ${safeHeight} ${rightTopInset} ${bottomStartY}`,
    `L ${rightTopInset} ${topDepth}`,
    `Q ${rightTopInset} 0 ${safeWidth} 0`,
    'Z',
  ].join(' ');
}

function IslandShapeDefs({ visualSize }: { visualSize: IslandVisualSize }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width="0"
      height="0"
      style={{ position: 'absolute', pointerEvents: 'none' }}
    >
      <defs>
        <clipPath id="island-shape-compact" clipPathUnits="objectBoundingBox">
          <path
            id="island-shape-compact-path"
            d="M 0 0 Q 0.11 0 0.11 0.3125 L 0.11 0.6875 Q 0.11 1 0.135 1 L 0.865 1 Q 0.89 1 0.89 0.6875 L 0.89 0.3125 Q 0.89 0 1 0 Z"
          />
        </clipPath>
        <clipPath id="island-shape-expanded" clipPathUnits="userSpaceOnUse">
          <path
            id="island-shape-expanded-path"
            d={buildIslandPath(
              visualSize.width,
              visualSize.height,
              getIslandMorphProgress(visualSize.width)
            )}
          />
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
  activeSource: SourceState | null,
  activeReminder: AgentReminder | null
): JSX.Element {
  if (isLoading && !state) {
    return <PlaceholderState message="Loading configured sources" iconVariant="sync" />;
  }

  if (!isLoading && loadError) {
    return <PlaceholderState message={loadError} iconVariant="warn" />;
  }

  if (!isLoading && !loadError && (activeReminder || activeSource)) {
    return (
      <div className="island__compact-row">
        <IslandCompact source={activeSource} reminder={activeReminder} />
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
  handleJumpToSession: (sessionId: string | undefined) => Promise<void>,
  handleResolveApproval: (sessionId: string | undefined, decision: AgentApprovalDecision) => Promise<void>
): JSX.Element | null {
  if (!state) {
    return null;
  }

  return (
    <IslandExpanded
      state={state}
      onOpenTarget={handleOpenTarget}
      onJumpToSession={handleJumpToSession}
      onResolveApproval={handleResolveApproval}
    />
  );
}


function clearTimerRef(timerRef: { current: number | null }): void {
  const timer = timerRef.current;

  if (timer === null) {
    return;
  }

  window.clearTimeout(timer);
  timerRef.current = null;
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
  const { state, isLoading, loadError } = useOverlayContext();
  const [overlayHostKind, setOverlayHostKind] = useState<OverlayHostKind | null>(null);
  const [presentationMode, setPresentationMode] = useState<OverlayPresentationMode>('compact');
  const [isShellAnimating, setIsShellAnimating] = useState(false);
  const expandTimerRef = useRef<number | null>(null);
  const collapseTimerRef = useRef<number | null>(null);
  const shellAnimationTimerRef = useRef<number | null>(null);
  const reminderCollapseTimerRef = useRef<number | null>(null);
  const reminderExpandedRef = useRef(false);
  const hoverExpandLockedRef = useRef(false);
  const suppressedReminderIdRef = useRef<string | null>(null);
  const lastReminderIdRef = useRef<string | null>(null);
  const islandRef = useRef<HTMLElement | null>(null);
  const expandedMeasureRef = useRef<HTMLDivElement | null>(null);
  const lastMeasuredExpandedHeightRef = useRef<number | null>(null);
  const [islandVisualSize, setIslandVisualSize] = useState<IslandVisualSize>({
    width: APP_CONFIG.window.compactWidth,
    height: APP_CONFIG.window.compactHeight,
  });

  const sources = state?.sources ?? [];
  const rotationIntervalMs = state?.rotationIntervalMs ?? 10_000;
  const activeReminder = state?.agent.activeReminder ?? null;
  const visibleReminder = activeReminder && suppressedReminderIdRef.current !== activeReminder.id
    ? activeReminder
    : null;
  const activeSource = useActiveSource(sources, rotationIntervalMs);
  const displayState = useMemo(() => {
    if (!state || !activeReminder || visibleReminder) {
      return state;
    }

    return {
      ...state,
      agent: {
        ...state.agent,
        activeReminder: null,
      },
    };
  }, [activeReminder, state, visibleReminder]);

  const handleOpenTarget = async (targetUrl: string | undefined): Promise<void> => {
    if (!targetUrl) {
      return;
    }

    await window.api.app.openTarget(targetUrl);
  };

  const handleJumpToSession = async (sessionId: string | undefined): Promise<void> => {
    if (!sessionId) {
      return;
    }

    if (activeReminder) {
      suppressedReminderIdRef.current = activeReminder.id;
    }
    hoverExpandLockedRef.current = true;
    clearTimerRef(expandTimerRef);
    clearTimerRef(collapseTimerRef);
    requestWindowMode(false);
    await window.api.app.jumpToAgentSession(sessionId);
  };

  const handleResolveApproval = async (sessionId: string | undefined, decision: AgentApprovalDecision): Promise<void> => {
    if (!sessionId) {
      return;
    }

    const session = state?.agent.sessions.find((item) => item.id === sessionId);
    const shouldJumpToCodexConfirmation = decision !== 'deny'
      && session?.tool === 'codex'
      && session.lastEventName === 'PreToolUse';
    const didResolve = await window.api.agent.resolveApproval(sessionId, decision).catch(() => false);

    if (!didResolve) {
      return;
    }

    if (activeReminder) {
      suppressedReminderIdRef.current = activeReminder.id;
    }

    hoverExpandLockedRef.current = true;
    clearTimerRef(expandTimerRef);
    clearTimerRef(collapseTimerRef);
    clearTimerRef(reminderCollapseTimerRef);
    requestWindowMode(false);

    if (shouldJumpToCodexConfirmation) {
      await window.api.app.jumpToAgentSession(sessionId);
    }
  };

  const isExpandedVisual = presentationMode === 'expanding' || presentationMode === 'expanded';
  const keepsDetailVisible = presentationMode !== 'compact';

  const requestWindowMode = useCallback((expanded: boolean): void => {
    const isAlreadyExpanded = presentationMode === 'expanded' || presentationMode === 'expanding';
    const isAlreadyCompact = presentationMode === 'compact' || presentationMode === 'collapsing';

    if ((expanded && isAlreadyExpanded) || (!expanded && isAlreadyCompact)) {
      return;
    }

    clearTimerRef(shellAnimationTimerRef);
    setIsShellAnimating(true);
    setPresentationMode(expanded ? 'expanding' : 'collapsing');
    void window.api.app.setOverlayExpanded(expanded);

    shellAnimationTimerRef.current = window.setTimeout(() => {
      shellAnimationTimerRef.current = null;
      setIsShellAnimating(false);
      setPresentationMode(expanded ? 'expanded' : 'compact');
    }, expanded ? APP_CONFIG.window.expandTransitionMs : APP_CONFIG.window.collapseTransitionMs);
  }, [presentationMode]);

  const collapseAndLockHover = useCallback((): void => {
    hoverExpandLockedRef.current = true;
    clearTimerRef(expandTimerRef);
    clearTimerRef(collapseTimerRef);
    requestWindowMode(false);
  }, [requestWindowMode]);

  const stableCompactContent = getStableCompactContent(isLoading, state, loadError, activeSource, visibleReminder);
  const hasExpandedBody = shouldShowExpandedBody(isLoading, state, loadError);
  const expandedBody = getExpandedBody(displayState, handleOpenTarget, handleJumpToSession, handleResolveApproval);
  const measureBody = hasExpandedBody ? expandedBody : null;

  const overlayClassName = useMemo(() => {
    const expandedClassName = isExpandedVisual ? ' overlay-shell--expanded' : '';
    const animatingClassName = isShellAnimating ? ' overlay-shell--animating' : '';
    const hostClassName = overlayHostKind === null ? '' : ` overlay-shell--${overlayHostKind}`;

    return `overlay-shell${expandedClassName}${animatingClassName}${hostClassName}`;
  }, [isExpandedVisual, isShellAnimating, overlayHostKind]);
  const usesRendererHover = overlayHostKind !== 'native-macos-panel';

  const islandClassName = useMemo(() => {
    const phaseClassName = ` island--${presentationMode}`;
    const placeholderClassName = !state || loadError || (!activeSource && !visibleReminder) ? ' island--placeholder' : '';
    const animatingClassName = isShellAnimating ? ' island--animating' : '';

    return `island${phaseClassName}${placeholderClassName}${animatingClassName}`;
  }, [activeSource, isShellAnimating, loadError, presentationMode, state, visibleReminder]);

  const scheduleExpand = useCallback((): void => {
    clearTimerRef(collapseTimerRef);

    if (hoverExpandLockedRef.current) {
      return;
    }

    if (isExpandedVisual || expandTimerRef.current !== null) {
      return;
    }

    expandTimerRef.current = window.setTimeout(() => {
      expandTimerRef.current = null;
      requestWindowMode(true);
    }, APP_CONFIG.window.expandHoverDelayMs);
  }, [isExpandedVisual, requestWindowMode]);

  const scheduleCollapse = useCallback((): void => {
    clearTimerRef(expandTimerRef);

    if (!isExpandedVisual || collapseTimerRef.current !== null) {
      return;
    }

    collapseTimerRef.current = window.setTimeout(() => {
      collapseTimerRef.current = null;
      requestWindowMode(false);
    }, APP_CONFIG.window.collapseHoverDelayMs);
  }, [isExpandedVisual, requestWindowMode]);

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
      clearTimerRef(expandTimerRef);
      clearTimerRef(collapseTimerRef);
      clearTimerRef(shellAnimationTimerRef);
      clearTimerRef(reminderCollapseTimerRef);
    };
  }, []);

  useEffect(() => {
    return window.api.app.subscribeOverlayMode((mode) => {
      clearTimerRef(expandTimerRef);
      clearTimerRef(collapseTimerRef);
      clearTimerRef(shellAnimationTimerRef);
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

  const syncIslandVisualSize = useCallback((width: number, height: number): void => {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      return;
    }

    const nextSize = {
      width: Math.ceil(width),
      height: Math.ceil(height),
    };

    setIslandVisualSize((currentSize) => (
      currentSize.width === nextSize.width && currentSize.height === nextSize.height
        ? currentSize
        : nextSize
    ));
  }, []);

  const reportExpandedContentHeight = useCallback((height: number): void => {
    const nextHeight = Math.max(
      APP_CONFIG.window.compactHeight,
      Math.min(APP_CONFIG.window.expandedHeight, Math.ceil(height))
    );

    if (lastMeasuredExpandedHeightRef.current === nextHeight) {
      return;
    }

    lastMeasuredExpandedHeightRef.current = nextHeight;
    void window.api.app.setExpandedContentHeight(nextHeight);
  }, []);

  useLayoutEffect(() => {
    if (presentationMode === 'compact') {
      return;
    }

    const islandElement = islandRef.current;
    if (!islandElement) {
      return;
    }

    const updateSize = (): void => {
      const { width, height } = islandElement.getBoundingClientRect();
      syncIslandVisualSize(width, height);
    };

    updateSize();
    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(islandElement);

    return () => {
      observer.disconnect();
    };
  }, [presentationMode, syncIslandVisualSize]);

  useEffect(() => {
    if (presentationMode !== 'compact') {
      return;
    }

    setIslandVisualSize({
      width: APP_CONFIG.window.compactWidth,
      height: APP_CONFIG.window.compactHeight,
    });
  }, [presentationMode]);

  useLayoutEffect(() => {
    const measureElement = expandedMeasureRef.current;
    if (!measureElement || !measureBody) {
      return;
    }

    const updateHeight = (): void => {
      reportExpandedContentHeight(measureElement.getBoundingClientRect().height);
    };

    updateHeight();
    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(measureElement);

    return () => {
      observer.disconnect();
    };
  }, [measureBody, reportExpandedContentHeight]);

  useEffect(() => {
    clearTimerRef(reminderCollapseTimerRef);

    const nextReminderId = activeReminder?.id ?? null;
    if (nextReminderId !== lastReminderIdRef.current) {
      suppressedReminderIdRef.current = null;
      hoverExpandLockedRef.current = false;
      lastReminderIdRef.current = nextReminderId;
    }

    if (!activeReminder || !activeReminder.shouldExpand) {
      if (reminderExpandedRef.current) {
        reminderExpandedRef.current = false;
        collapseAndLockHover();
      }

      return;
    }

    if (suppressedReminderIdRef.current === activeReminder.id) {
      reminderExpandedRef.current = false;
      return;
    }

    reminderExpandedRef.current = true;
    requestWindowMode(true);

    if (activeReminder.expiresAtMs !== null) {
      const delayMs = Math.max(activeReminder.expiresAtMs - Date.now(), 0);
      reminderCollapseTimerRef.current = window.setTimeout(() => {
        reminderCollapseTimerRef.current = null;
        reminderExpandedRef.current = false;
        collapseAndLockHover();
      }, delayMs);
    }

    return () => {
      clearTimerRef(reminderCollapseTimerRef);
    };
  }, [activeReminder, collapseAndLockHover, requestWindowMode]);

  return (
    <>
      <IslandShapeDefs visualSize={islandVisualSize} />
      <main
        className={overlayClassName}
        data-host-kind={overlayHostKind ?? 'unknown'}
      >
        <section
          className={islandClassName}
          ref={islandRef}
          aria-live="polite"
          aria-label={isExpandedVisual ? 'Dynamic island expanded details' : 'Dynamic island compact summary'}
          onMouseEnter={() => {
            if (!usesRendererHover) {
              return;
            }

            scheduleExpand();
          }}
          onMouseLeave={() => {
            if (!usesRendererHover) {
              return;
            }

            hoverExpandLockedRef.current = false;
            scheduleCollapse();
          }}
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
      {measureBody ? (
        <div className="island__measure-root" aria-hidden="true">
          <div
            className="island__measure-detail"
            ref={expandedMeasureRef}
            style={{ width: APP_CONFIG.window.expandedWidth - 20 }}
          >
            {measureBody}
          </div>
        </div>
      ) : null}
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
