export const APP_CONFIG = {
  window: {
    compactWidth: 480,
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
    widthPresets: {
      small: {
        compactWidth: 420,
        expandedWidth: 540,
      },
      medium: {
        compactWidth: 480,
        expandedWidth: 600,
      },
      large: {
        compactWidth: 560,
        expandedWidth: 700,
      },
    },
  },
  rotationIntervalMs: 10_000,
  language: 'zh-CN',
  islandWidthPreset: 'medium',
  polling: {
    defaultRefreshIntervalMs: 60_000,
    minRefreshIntervalMs: 15_000,
    requestTimeoutMs: 8_000,
  },
  detailItemDefaults: {
    json: 1,
  },
  focusTimers: {
    defaultOptions: [
      {
        id: 'countdown-5',
        label: '倒计时 5 分钟',
        durationMinutes: 5,
        enabled: false,
      },
      {
        id: 'countdown-10',
        label: '倒计时 10 分钟',
        durationMinutes: 10,
        enabled: false,
      },
      {
        id: 'countdown-15',
        label: '倒计时 15 分钟',
        durationMinutes: 15,
        enabled: false,
      },
      {
        id: 'countdown-20',
        label: '倒计时 20 分钟',
        durationMinutes: 20,
        enabled: false,
      },
      {
        id: 'countdown-25',
        label: '倒计时 25 分钟',
        durationMinutes: 25,
        enabled: true,
      },
      {
        id: 'custom',
        label: '自定义倒计时',
        durationMinutes: 30,
        enabled: false,
      },
    ],
  },
} as const;
