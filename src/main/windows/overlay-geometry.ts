import { screen } from 'electron';

import { APP_CONFIG } from '../../shared/constants/config';
import {
  getIslandWindowDimensions,
  type IslandWidthPreset,
} from '../../shared/types/config';

import type { OverlayHostWindowMode } from './overlay-host';

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const HOST_TOP_COMPENSATION = {
  compact: -2,
  expanded: -1,
} as const;

const HOST_BOUNDS_COMPENSATION = {
  compactHeight: 3,
} as const;

// Keep browser fallback geometry in lockstep with the native host.
export function getOverlayTop(display: Electron.Display, mode: OverlayHostWindowMode): number {
  const compactTop =
    display.workArea.y +
    HOST_TOP_COMPENSATION.compact -
    APP_CONFIG.window.compactHeight +
    APP_CONFIG.window.compactTopMargin;

  if (mode === 'expanded') {
    return compactTop + APP_CONFIG.window.expandedTopMargin + HOST_TOP_COMPENSATION.expanded;
  }

  return compactTop;
}

export function getOverlayBounds(
  mode: OverlayHostWindowMode,
  expandedHeight: number = APP_CONFIG.window.expandedHeight,
  islandWidthPreset: IslandWidthPreset = APP_CONFIG.islandWidthPreset
): WindowBounds {
  const display = screen.getPrimaryDisplay();
  const dimensions = getIslandWindowDimensions(islandWidthPreset);
  const width = mode === 'expanded' ? dimensions.expandedWidth : dimensions.compactWidth;
  const height = mode === 'expanded' ? expandedHeight : APP_CONFIG.window.compactHeight;
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2);
  const y = getOverlayTop(display, mode);

  return { x, y, width, height };
}

export function getHostOverlayBounds(
  mode: OverlayHostWindowMode,
  expandedHeight: number = APP_CONFIG.window.expandedHeight,
  islandWidthPreset: IslandWidthPreset = APP_CONFIG.islandWidthPreset
): WindowBounds {
  const bounds = getOverlayBounds(mode, expandedHeight, islandWidthPreset);

  if (mode === 'compact') {
    return {
      ...bounds,
      height: bounds.height + HOST_BOUNDS_COMPENSATION.compactHeight,
    };
  }

  return bounds;
}
