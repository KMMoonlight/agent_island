export const APP_CONFIG = {
  window: {
    compactWidth: 400,
    compactHeight: 60,
    expandedWidth: 600,
    expandedHeight: 360,
    topMargin: 8,
    hoverPadding: 14,
    modeTransitionMs: 220,
  },
  rotationIntervalMs: 10_000,
  polling: {
    defaultRefreshIntervalMs: 60_000,
    minRefreshIntervalMs: 15_000,
  },
  detailItemDefaults: {
    json: 1,
    rss: 3,
  },
} as const;
