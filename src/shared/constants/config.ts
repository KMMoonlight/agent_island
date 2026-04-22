export const APP_CONFIG = {
  window: {
    compactWidth: 376,
    compactHeight: 32,
    expandedWidth: 600,
    expandedHeight: 360,
    compactTopMargin: -1,
    expandedTopMargin: -2,
    hoverPadding: 14,
    expandTransitionMs: 420,
    collapseTransitionMs: 300,
    expandHoverDelayMs: 130,
    collapseHoverDelayMs: 240,
    expandedRadiusPx: 14,
  },
  rotationIntervalMs: 10_000,
  polling: {
    defaultRefreshIntervalMs: 60_000,
    minRefreshIntervalMs: 15_000,
    requestTimeoutMs: 8_000,
  },
  detailItemDefaults: {
    json: 1,
  },
} as const;
