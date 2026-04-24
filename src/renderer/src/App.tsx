import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { APP_CONFIG } from '@shared/constants/config';
import type { AgentApprovalDecision, AgentQuestionResponse, AgentReminder } from '@shared/types/agent-hook';
import { getIslandWindowDimensions, type IslandWindowDimensions } from '@shared/types/config';
import type { OverlayExpandOptions, OverlayHostKind } from '@shared/types/ipc';
import type { ActiveFocusTimer, CompletedFocusTimer, SourceState } from '@shared/types/source-data';

import { OverlayProvider } from './features/overlay/context/OverlayContext';
import { useOverlayContext } from './features/overlay/context/overlay-context';
import {
  FocusTimerCompletedCompact,
  IslandCompact,
  IslandPlaceholder,
} from './features/overlay/components/IslandCompact';
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

type CompactRotationItem =
  | {
      kind: 'source';
      source: SourceState;
    }
  | {
      kind: 'focusTimer';
      timer: ActiveFocusTimer;
    };

type WindowModeRequestOptions = {
  force?: boolean;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function interpolateNumber(start: number, end: number, progress: number): number {
  return start + ((end - start) * progress);
}

const DEFAULT_ISLAND_DIMENSIONS = getIslandWindowDimensions(APP_CONFIG.islandWidthPreset);

function getCompactCurveProfile(dimensions: IslandWindowDimensions): IslandCurveProfile {
  return {
    topInset: dimensions.compactWidth * 0.11,
    topDepth: APP_CONFIG.window.compactHeight * 0.3125,
    bottomInset: dimensions.compactWidth * 0.135,
    bottomDepth: APP_CONFIG.window.compactHeight * 0.3125,
  };
}

function getExpandedCurveProfile(height: number): IslandCurveProfile {
  const safeHeight = Math.max(1, height);
  const scale = Math.min(1, safeHeight / 58);

  return {
    topInset: 22 * scale,
    topDepth: 22 * scale,
    bottomInset: 34 * scale,
    bottomDepth: 18 * scale,
  };
}

function getIslandMorphProgress(width: number, dimensions: IslandWindowDimensions): number {
  const widthRange = dimensions.expandedWidth - dimensions.compactWidth;
  if (widthRange <= 0) {
    return 1;
  }

  return clamp01((width - dimensions.compactWidth) / widthRange);
}

function buildIslandPath(width: number, height: number, morphProgress: number, dimensions: IslandWindowDimensions): string {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const progress = clamp01(morphProgress);
  const easedCornerProgress = Math.pow(progress, 0.72);
  const compactCurve = getCompactCurveProfile(dimensions);
  const expandedCurve = getExpandedCurveProfile(safeHeight);
  const topInset = interpolateNumber(compactCurve.topInset, expandedCurve.topInset, progress);
  const topDepth = interpolateNumber(compactCurve.topDepth, expandedCurve.topDepth, easedCornerProgress);
  const bottomInset = interpolateNumber(compactCurve.bottomInset, expandedCurve.bottomInset, easedCornerProgress);
  const animatedBottomDepth = interpolateNumber(compactCurve.bottomDepth, expandedCurve.bottomDepth, easedCornerProgress);
  const bottomDepth = Math.max(animatedBottomDepth, safeHeight * 0.05);
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

function getIslandPathDefinition(visualSize: IslandVisualSize, dimensions: IslandWindowDimensions): string {
  return buildIslandPath(
    visualSize.width,
    visualSize.height,
    getIslandMorphProgress(visualSize.width, dimensions),
    dimensions
  );
}

function IslandShapeDefs({ dimensions, visualSize }: { dimensions: IslandWindowDimensions; visualSize: IslandVisualSize }): JSX.Element {
  const pathDefinition = getIslandPathDefinition(visualSize, dimensions);

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
            d={pathDefinition}
          />
        </clipPath>
      </defs>
    </svg>
  );
}

function IslandShapeSurface({ dimensions, visualSize }: { dimensions: IslandWindowDimensions; visualSize: IslandVisualSize }): JSX.Element {
  const width = Math.max(1, visualSize.width);
  const height = Math.max(1, visualSize.height);
  const pathDefinition = getIslandPathDefinition({ width, height }, dimensions);

  return (
    <svg
      aria-hidden="true"
      className="island__shape-surface"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="island-shape-surface-highlight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(0 0% 100% / 0.05)" />
          <stop offset="18%" stopColor="hsl(0 0% 100% / 0)" />
          <stop offset="100%" stopColor="hsl(0 0% 100% / 0)" />
        </linearGradient>
      </defs>
      <path
        className="island__shape-surface-fill"
        d={pathDefinition}
      />
      <path
        className="island__shape-surface-highlight"
        d={pathDefinition}
      />
      <path
        className="island__shape-outline-path"
        d={pathDefinition}
      />
    </svg>
  );
}

function getStableCompactContent(
  activeCompletedFocusTimer: CompletedFocusTimer | null,
  activeCompactItem: CompactRotationItem | null,
  isLoading: boolean,
  nowMs: number,
  state: ReturnType<typeof useOverlayContext>['state'],
  loadError: string | null,
  activeReminder: AgentReminder | null
): JSX.Element {
  if (isLoading && !state) {
    return <IslandPlaceholder message="Loading configured sources" kind="loading" />;
  }

  if (!isLoading && loadError) {
    return <IslandPlaceholder message={loadError} kind="error" />;
  }

  if (!isLoading && !loadError && activeReminder) {
    return (
      <div className="island__compact-row">
        <IslandCompact nowMs={nowMs} source={null} reminder={activeReminder} />
      </div>
    );
  }

  if (!isLoading && !loadError && activeCompletedFocusTimer) {
    return (
      <div className="island__compact-row">
        <FocusTimerCompletedCompact completedFocusTimer={activeCompletedFocusTimer} />
      </div>
    );
  }

  if (!isLoading && !loadError && activeCompactItem) {
    const activeSource = activeCompactItem.kind === 'source' ? activeCompactItem.source : null;
    const activeFocusTimer = activeCompactItem.kind === 'focusTimer' ? activeCompactItem.timer : null;

    return (
      <div className="island__compact-row">
        <IslandCompact focusTimer={activeFocusTimer} nowMs={nowMs} source={activeSource} />
      </div>
    );
  }

  return <IslandPlaceholder message="No sources configured" iconOnly />;
}

function shouldShowExpandedBody(
  isLoading: boolean,
  state: ReturnType<typeof useOverlayContext>['state'],
  loadError: string | null
): boolean {
  return !isLoading && !loadError && Boolean(state);
}

function getExpandedBody(
  nowMs: number,
  state: ReturnType<typeof useOverlayContext>['state'],
  handleOpenTarget: (targetUrl: string | undefined) => Promise<void>,
  handleJumpToSession: (sessionId: string | undefined) => Promise<void>,
  handleResolveApproval: (sessionId: string | undefined, decision: AgentApprovalDecision) => Promise<void>,
  handleAnswerQuestion: (sessionId: string | undefined, response: AgentQuestionResponse) => Promise<void>,
  handleDismissFocusTimerCompletion: () => Promise<void>
): JSX.Element | null {
  if (!state) {
    return null;
  }

  return (
    <IslandExpanded
      nowMs={nowMs}
      state={state}
      onOpenTarget={handleOpenTarget}
      onJumpToSession={handleJumpToSession}
      onResolveApproval={handleResolveApproval}
      onAnswerQuestion={handleAnswerQuestion}
      onDismissFocusTimerCompletion={() => {
        void handleDismissFocusTimerCompletion();
      }}
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

function isReminderExpired(reminder: AgentReminder, nowMs: number = Date.now()): boolean {
  return reminder.expiresAtMs !== null && reminder.expiresAtMs <= nowMs;
}

const REMINDER_HOLD_GRACE_MS = 1_600;

function useActiveCompactItem(
  sources: SourceState[],
  activeFocusTimer: ActiveFocusTimer | null,
  rotationIntervalMs: number
): CompactRotationItem | null {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeFocusTimerId = activeFocusTimer?.id ?? null;
  const items = useMemo<CompactRotationItem[]>(() => {
    const sourceItems: CompactRotationItem[] = sources.map((source) => ({
      kind: 'source',
      source,
    }));

    if (!activeFocusTimer) {
      return sourceItems;
    }

    return [
      ...sourceItems,
      {
        kind: 'focusTimer',
        timer: activeFocusTimer,
      },
    ];
  }, [activeFocusTimer, sources]);

  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (!activeFocusTimerId) {
      return;
    }

    const focusTimerIndex = items.findIndex((item) => item.kind === 'focusTimer' && item.timer.id === activeFocusTimerId);
    if (focusTimerIndex < 0) {
      return;
    }

    setActiveIndex(focusTimerIndex);
  }, [activeFocusTimerId, items]);

  useEffect(() => {
    if (items.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % items.length);
    }, rotationIntervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [items.length, rotationIntervalMs]);

  return items[activeIndex] ?? null;
}

function useFocusTimerNow(activeFocusTimer: ActiveFocusTimer | null): number {
  const [nowMs, setNowMs] = useState(Date.now());
  const activeFocusTimerId = activeFocusTimer?.id ?? null;

  useEffect(() => {
    if (!activeFocusTimerId) {
      return;
    }

    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeFocusTimerId]);

  return nowMs;
}

function OverlayApp(): JSX.Element {
  const { state, isLoading, loadError } = useOverlayContext();
  const [overlayHostKind, setOverlayHostKind] = useState<OverlayHostKind | null>(null);
  const [presentationMode, setPresentationMode] = useState<OverlayPresentationMode>('compact');
  const [isShellAnimating, setIsShellAnimating] = useState(false);
  const [heldReminder, setHeldReminder] = useState<AgentReminder | null>(null);
  const [suppressedFocusCompletionId, setSuppressedFocusCompletionId] = useState<string | null>(null);
  const expandTimerRef = useRef<number | null>(null);
  const collapseTimerRef = useRef<number | null>(null);
  const shellAnimationTimerRef = useRef<number | null>(null);
  const reminderCollapseTimerRef = useRef<number | null>(null);
  const focusCompletionCollapseTimerRef = useRef<number | null>(null);
  const reminderHoldReleaseTimerRef = useRef<number | null>(null);
  const reminderExpandedRef = useRef(false);
  const reminderHoldActiveRef = useRef(false);
  const hoverExpandLockedRef = useRef(false);
  const suppressedReminderIdRef = useRef<string | null>(null);
  const lastReminderIdRef = useRef<string | null>(null);
  const lastReminderSnapshotRef = useRef<AgentReminder | null>(null);
  const activeReminderRef = useRef<AgentReminder | null>(null);
  const islandRef = useRef<HTMLElement | null>(null);
  const expandedMeasureRef = useRef<HTMLDivElement | null>(null);
  const lastMeasuredExpandedHeightRef = useRef<number | null>(null);
  const [islandVisualSize, setIslandVisualSize] = useState<IslandVisualSize>({
    width: DEFAULT_ISLAND_DIMENSIONS.compactWidth,
    height: APP_CONFIG.window.compactHeight,
  });

  const sources = state?.sources ?? [];
  const rotationIntervalMs = state?.rotationIntervalMs ?? 10_000;
  const islandDimensions = useMemo(
    () => getIslandWindowDimensions(state?.islandWidthPreset ?? APP_CONFIG.islandWidthPreset),
    [state?.islandWidthPreset]
  );
  const activeFocusTimer = state?.focusTimer.active ?? null;
  const stateCompletedFocusTimer = state?.focusTimer.completed ?? null;
  const completedFocusTimer = stateCompletedFocusTimer?.id === suppressedFocusCompletionId
    ? null
    : stateCompletedFocusTimer;
  const focusTimerNowMs = useFocusTimerNow(activeFocusTimer);
  const stateReminder = state?.agent.activeReminder ?? null;
  const activeReminder = reminderHoldActiveRef.current && heldReminder
    ? heldReminder
    : stateReminder ?? heldReminder;
  const visibleReminder = activeReminder
    && suppressedReminderIdRef.current !== activeReminder.id
    && !isReminderExpired(activeReminder)
    ? activeReminder
    : null;
  const hasHoverHoldReminder = Boolean(
    visibleReminder
    && visibleReminder.shouldExpand
    && visibleReminder.expiresAtMs !== null
  );
  const shouldKeepSuppressedReminderVisible = Boolean(
    activeReminder
    && suppressedReminderIdRef.current === activeReminder.id
    && presentationMode === 'collapsing'
  );
  const keepsReminderPinned = Boolean(
    visibleReminder
    && visibleReminder.shouldExpand
    && (reminderHoldActiveRef.current || visibleReminder.expiresAtMs === null || visibleReminder.expiresAtMs > Date.now())
  );
  const activeCompactItem = useActiveCompactItem(sources, activeFocusTimer, rotationIntervalMs);
  const displayState = useMemo(() => {
    if (!state) {
      return state;
    }

    const nextReminder = visibleReminder || shouldKeepSuppressedReminderVisible ? activeReminder : null;
    const nextFocusTimer = state.focusTimer.completed?.id === completedFocusTimer?.id
      ? state.focusTimer
      : {
          ...state.focusTimer,
          completed: completedFocusTimer,
        };

    if (
      state.agent.activeReminder?.id === nextReminder?.id
      && state.focusTimer.completed?.id === nextFocusTimer.completed?.id
    ) {
      return state;
    }

    return {
      ...state,
      agent: {
        ...state.agent,
        activeReminder: nextReminder,
      },
      focusTimer: nextFocusTimer,
    };
  }, [activeReminder, completedFocusTimer, shouldKeepSuppressedReminderVisible, state, visibleReminder]);
  const usesRendererHover = overlayHostKind !== 'native-macos-panel';

  const setReminderHoldActive = useCallback((active: boolean): void => {
    if (reminderHoldActiveRef.current === active) {
      return;
    }

    reminderHoldActiveRef.current = active;
    void window.api.app.setReminderHoldActive(active).catch(() => {
      // Ignore transient IPC failures so reminder rendering remains responsive.
    });
  }, []);

  const setHoverExpandLocked = useCallback((locked: boolean): void => {
    hoverExpandLockedRef.current = usesRendererHover ? locked : false;
  }, [usesRendererHover]);

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

    const jumpRequest = window.api.app.jumpToAgentSession(sessionId).catch(() => false);
    const shouldDismissActiveReminder = activeReminder?.sessionId === sessionId;
    if (activeReminder) {
      suppressedReminderIdRef.current = activeReminder.id;
    }
    setReminderHoldActive(false);
    setHeldReminder(null);
    setHoverExpandLocked(true);
    clearTimerRef(expandTimerRef);
    clearTimerRef(collapseTimerRef);
    clearTimerRef(reminderHoldReleaseTimerRef);
    requestWindowMode(false, { suppressHoverUntilLeave: false });
    if (shouldDismissActiveReminder) {
      void window.api.agent.dismissReminder(sessionId).catch(() => false);
    }
    await jumpRequest;
  };

  const handleResolveApproval = async (sessionId: string | undefined, decision: AgentApprovalDecision): Promise<void> => {
    if (!sessionId) {
      return;
    }

    const didResolve = await window.api.agent.resolveApproval(sessionId, decision).catch(() => false);

    if (!didResolve) {
      return;
    }

    if (activeReminder) {
      suppressedReminderIdRef.current = activeReminder.id;
    }

    setReminderHoldActive(false);
    setHeldReminder(null);
    setHoverExpandLocked(true);
    clearTimerRef(expandTimerRef);
    clearTimerRef(collapseTimerRef);
    clearTimerRef(reminderCollapseTimerRef);
    clearTimerRef(reminderHoldReleaseTimerRef);
    requestWindowMode(false, { suppressHoverUntilLeave: false });
  };

  const handleAnswerQuestion = async (sessionId: string | undefined, response: AgentQuestionResponse): Promise<void> => {
    if (!sessionId) {
      return;
    }

    const didAnswer = await window.api.agent.answerQuestion(sessionId, response).catch(() => false);

    if (!didAnswer) {
      return;
    }

    if (activeReminder) {
      suppressedReminderIdRef.current = activeReminder.id;
    }

    setReminderHoldActive(false);
    setHeldReminder(null);
    setHoverExpandLocked(true);
    clearTimerRef(expandTimerRef);
    clearTimerRef(collapseTimerRef);
    clearTimerRef(reminderCollapseTimerRef);
    clearTimerRef(reminderHoldReleaseTimerRef);
    requestWindowMode(false, { suppressHoverUntilLeave: false });
  };

  const handleDismissFocusTimerCompletion = async (): Promise<void> => {
    if (stateCompletedFocusTimer) {
      setSuppressedFocusCompletionId(stateCompletedFocusTimer.id);
    }

    setHoverExpandLocked(true);
    clearTimerRef(expandTimerRef);
    clearTimerRef(collapseTimerRef);
    clearTimerRef(focusCompletionCollapseTimerRef);
    requestWindowMode(false, { suppressHoverUntilLeave: false });
    await window.api.app.dismissFocusTimerCompletion().catch(() => undefined);
  };

  const stableCompactContent = getStableCompactContent(
    completedFocusTimer,
    activeCompactItem,
    isLoading,
    focusTimerNowMs,
    state,
    loadError,
    visibleReminder
  );
  const hasExpandedBody = shouldShowExpandedBody(isLoading, state, loadError);
  const expandedBody = getExpandedBody(
    focusTimerNowMs,
    displayState,
    handleOpenTarget,
    handleJumpToSession,
    handleResolveApproval,
    handleAnswerQuestion,
    handleDismissFocusTimerCompletion
  );
  const measureBody = hasExpandedBody ? expandedBody : null;

  const syncExpandedContentHeightBeforeExpand = useCallback(async (): Promise<void> => {
    const measureElement = expandedMeasureRef.current;
    if (!measureElement || !measureBody) {
      return;
    }

    const nextHeight = Math.max(
      APP_CONFIG.window.compactHeight,
      Math.min(APP_CONFIG.window.expandedHeight, Math.ceil(measureElement.getBoundingClientRect().height))
    );

    lastMeasuredExpandedHeightRef.current = nextHeight;
    await window.api.app.setExpandedContentHeight(nextHeight);
  }, [measureBody]);

  const syncExpectedIslandVisualSize = useCallback((expanded: boolean): void => {
    if (!expanded) {
      setIslandVisualSize({
        width: islandDimensions.compactWidth,
        height: APP_CONFIG.window.compactHeight,
      });
      return;
    }

    const expectedHeight = Math.max(
      APP_CONFIG.window.compactHeight,
      Math.min(
        APP_CONFIG.window.expandedHeight,
        Math.ceil(lastMeasuredExpandedHeightRef.current ?? APP_CONFIG.window.expandedHeight)
      )
    );

    setIslandVisualSize((currentSize) => (
      currentSize.width === islandDimensions.expandedWidth && currentSize.height === expectedHeight
        ? currentSize
        : {
            width: islandDimensions.expandedWidth,
            height: expectedHeight,
          }
    ));
  }, [islandDimensions]);

  const isExpandedVisual = presentationMode === 'expanding' || presentationMode === 'expanded';
  const keepsDetailVisible = presentationMode !== 'compact';

  const requestWindowMode = useCallback((
    expanded: boolean,
    options?: OverlayExpandOptions,
    requestOptions: WindowModeRequestOptions = {}
  ): void => {
    const isAlreadyExpanded = presentationMode === 'expanded' || presentationMode === 'expanding';
    const isAlreadyCompact = presentationMode === 'compact' || presentationMode === 'collapsing';

    if (!requestOptions.force && ((expanded && isAlreadyExpanded) || (!expanded && isAlreadyCompact))) {
      return;
    }

    void (async () => {
      if (expanded) {
        await syncExpandedContentHeightBeforeExpand();
      }

      syncExpectedIslandVisualSize(expanded);
      clearTimerRef(shellAnimationTimerRef);
      setIsShellAnimating(true);
      setPresentationMode(expanded ? 'expanding' : 'collapsing');
      await window.api.app.setOverlayExpanded(expanded, options);

      shellAnimationTimerRef.current = window.setTimeout(() => {
        shellAnimationTimerRef.current = null;
        setIsShellAnimating(false);
        setPresentationMode(expanded ? 'expanded' : 'compact');
      }, expanded ? APP_CONFIG.window.expandTransitionMs : APP_CONFIG.window.collapseTransitionMs);
    })();
  }, [presentationMode, syncExpandedContentHeightBeforeExpand, syncExpectedIslandVisualSize]);
  const requestWindowModeRef = useRef(requestWindowMode);

  useEffect(() => {
    requestWindowModeRef.current = requestWindowMode;
  }, [requestWindowMode]);

  const collapseAndLockHover = useCallback((): void => {
    setHoverExpandLocked(true);
    clearTimerRef(expandTimerRef);
    clearTimerRef(collapseTimerRef);
    requestWindowModeRef.current(false, { suppressHoverUntilLeave: true }, { force: true });
  }, [setHoverExpandLocked]);

  const scheduleReminderExpiryCollapse = useCallback((reminder: AgentReminder): void => {
    clearTimerRef(reminderCollapseTimerRef);

    if (reminder.expiresAtMs === null || reminderHoldActiveRef.current) {
      return;
    }

    const delayMs = Math.max(reminder.expiresAtMs - Date.now(), 0);
    reminderCollapseTimerRef.current = window.setTimeout(() => {
      reminderCollapseTimerRef.current = null;
      suppressedReminderIdRef.current = reminder.id;
      collapseAndLockHover();
    }, delayMs);
  }, [collapseAndLockHover]);

  const overlayClassName = useMemo(() => {
    const expandedClassName = isExpandedVisual ? ' overlay-shell--expanded' : '';
    const animatingClassName = isShellAnimating ? ' overlay-shell--animating' : '';
    const hostClassName = overlayHostKind === null ? '' : ` overlay-shell--${overlayHostKind}`;

    return `overlay-shell${expandedClassName}${animatingClassName}${hostClassName}`;
  }, [isExpandedVisual, isShellAnimating, overlayHostKind]);

  const islandClassName = useMemo(() => {
    const phaseClassName = ` island--${presentationMode}`;
    const placeholderClassName = !state || loadError || (!activeCompactItem && !visibleReminder && !completedFocusTimer) ? ' island--placeholder' : '';
    const animatingClassName = isShellAnimating ? ' island--animating' : '';

    return `island${phaseClassName}${placeholderClassName}${animatingClassName}`;
  }, [activeCompactItem, completedFocusTimer, isShellAnimating, loadError, presentationMode, state, visibleReminder]);

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

    if (keepsReminderPinned) {
      return;
    }

    if (!isExpandedVisual || collapseTimerRef.current !== null) {
      return;
    }

    collapseTimerRef.current = window.setTimeout(() => {
      collapseTimerRef.current = null;
      requestWindowMode(false);
    }, APP_CONFIG.window.collapseHoverDelayMs);
  }, [isExpandedVisual, keepsReminderPinned, requestWindowMode]);

  const scheduleCollapseAfterReminderHold = useCallback((): void => {
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
      clearTimerRef(focusCompletionCollapseTimerRef);
      clearTimerRef(reminderHoldReleaseTimerRef);
      setReminderHoldActive(false);
    };
  }, [setReminderHoldActive]);

  useEffect(() => {
    return window.api.app.subscribeOverlayMode((mode) => {
      clearTimerRef(expandTimerRef);
      clearTimerRef(collapseTimerRef);
      clearTimerRef(shellAnimationTimerRef);
      setIsShellAnimating(true);
      syncExpectedIslandVisualSize(mode === 'expanded');

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
  }, [syncExpectedIslandVisualSize]);

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

    syncExpectedIslandVisualSize(false);
  }, [presentationMode, syncExpectedIslandVisualSize]);

  useEffect(() => {
    document.documentElement.lang = state?.language ?? APP_CONFIG.language;
  }, [state?.language]);

  useEffect(() => {
    const stateCompletedFocusTimerId = stateCompletedFocusTimer?.id ?? null;

    if (!stateCompletedFocusTimerId) {
      if (suppressedFocusCompletionId !== null) {
        setSuppressedFocusCompletionId(null);
      }
      return;
    }

    if (suppressedFocusCompletionId !== null && suppressedFocusCompletionId !== stateCompletedFocusTimerId) {
      setSuppressedFocusCompletionId(null);
    }
  }, [stateCompletedFocusTimer?.id, suppressedFocusCompletionId]);

  const completedFocusTimerId = completedFocusTimer?.id ?? null;
  const completedFocusTimerExpiresAtMs = completedFocusTimer?.expiresAtMs ?? null;

  useEffect(() => {
    clearTimerRef(focusCompletionCollapseTimerRef);

    if (!completedFocusTimerId || completedFocusTimerExpiresAtMs === null) {
      return;
    }

    requestWindowModeRef.current(true);

    const delayMs = Math.max(completedFocusTimerExpiresAtMs - Date.now(), 0);
    focusCompletionCollapseTimerRef.current = window.setTimeout(() => {
      focusCompletionCollapseTimerRef.current = null;
      setSuppressedFocusCompletionId(completedFocusTimerId);
      requestWindowModeRef.current(false);
      void window.api.app.dismissFocusTimerCompletion().catch(() => undefined);
    }, delayMs);

    return () => {
      clearTimerRef(focusCompletionCollapseTimerRef);
    };
  }, [completedFocusTimerExpiresAtMs, completedFocusTimerId]);

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
    activeReminderRef.current = activeReminder;
  }, [activeReminder]);

  useEffect(() => {
    if (stateReminder) {
      lastReminderSnapshotRef.current = stateReminder;
      if (heldReminder?.id !== stateReminder.id && heldReminder !== null) {
        setHeldReminder(null);
      }
      return;
    }

    if (!reminderHoldActiveRef.current) {
      if (heldReminder !== null) {
        setHeldReminder(null);
      }
      return;
    }

    const reminderSnapshot = lastReminderSnapshotRef.current;
    if (!reminderSnapshot || reminderSnapshot.expiresAtMs === null) {
      return;
    }

    if (heldReminder?.id === reminderSnapshot.id) {
      return;
    }

    setHeldReminder(reminderSnapshot);
  }, [heldReminder, stateReminder]);

  useEffect(() => {
    clearTimerRef(reminderCollapseTimerRef);

    const nextReminderId = activeReminder?.id ?? null;
    if (nextReminderId !== lastReminderIdRef.current) {
      suppressedReminderIdRef.current = null;
      setHoverExpandLocked(false);
      lastReminderIdRef.current = nextReminderId;
    }

    if (!activeReminder || !activeReminder.shouldExpand || isReminderExpired(activeReminder)) {
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

    scheduleReminderExpiryCollapse(activeReminder);

    return () => {
      clearTimerRef(reminderCollapseTimerRef);
    };
  }, [activeReminder, collapseAndLockHover, requestWindowMode, scheduleReminderExpiryCollapse, setHoverExpandLocked]);

  return (
    <>
      <IslandShapeDefs dimensions={islandDimensions} visualSize={islandVisualSize} />
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
            if (hasHoverHoldReminder) {
              clearTimerRef(reminderHoldReleaseTimerRef);
              setReminderHoldActive(true);
              const currentReminder = activeReminderRef.current;
              if (currentReminder && currentReminder.expiresAtMs !== null) {
                lastReminderSnapshotRef.current = currentReminder;
                if (heldReminder?.id !== currentReminder.id) {
                  setHeldReminder(currentReminder);
                }
              }
              clearTimerRef(reminderCollapseTimerRef);

              if (!usesRendererHover) {
                return;
              }

              clearTimerRef(collapseTimerRef);
              return;
            }

            if (!usesRendererHover) {
              return;
            }

            scheduleExpand();
          }}
          onMouseLeave={() => {
            if (hasHoverHoldReminder) {
              clearTimerRef(reminderHoldReleaseTimerRef);
              reminderHoldReleaseTimerRef.current = window.setTimeout(() => {
                reminderHoldReleaseTimerRef.current = null;
                setReminderHoldActive(false);
                setHeldReminder(null);
                if (!usesRendererHover) {
                  return;
                }

                const currentReminder = activeReminderRef.current;
                if (
                  currentReminder
                  && currentReminder.shouldExpand
                  && (currentReminder.expiresAtMs === null || currentReminder.expiresAtMs > Date.now())
                ) {
                  scheduleReminderExpiryCollapse(currentReminder);
                  return;
                }

                setHoverExpandLocked(false);
                scheduleCollapseAfterReminderHold();
              }, REMINDER_HOLD_GRACE_MS);
            }

            if (!usesRendererHover) {
              return;
            }

            if (hasHoverHoldReminder) {
              return;
            }

            if (keepsReminderPinned) {
              return;
            }

            setHoverExpandLocked(false);
            scheduleCollapse();
          }}
        >
          <IslandShapeSurface dimensions={islandDimensions} visualSize={islandVisualSize} />
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
            style={{ width: islandDimensions.expandedWidth - 20 }}
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
