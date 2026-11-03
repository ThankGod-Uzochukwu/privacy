import {MIN_MASK_SIZE, type Mask} from '@/core/store/settings';
import type {Rect} from '@/core/native/types';

/** Pure helpers for the screen map – no React, so they're trivially testable. */

export function mapScale(containerWidth: number, bounds: Rect, maxHeight = Infinity) {
  if (containerWidth <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return 0;
  }
  return Math.min(containerWidth / bounds.width, maxHeight / bounds.height);
}

/** Keeps a rect fully inside `bounds` while preserving its size. */
export function clampMove(rect: Rect, bounds: Rect): Rect {
  const x = Math.min(Math.max(rect.x, bounds.x), bounds.x + bounds.width - rect.width);
  const y = Math.min(Math.max(rect.y, bounds.y), bounds.y + bounds.height - rect.height);
  return {...rect, x: Math.round(x), y: Math.round(y)};
}

/** Resizes from the bottom-right corner, never smaller than the minimum or past the edge. */
export function clampResize(rect: Rect, dw: number, dh: number, bounds: Rect): Rect {
  const maxW = bounds.x + bounds.width - rect.x;
  const maxH = bounds.y + bounds.height - rect.y;
  return {
    ...rect,
    width: Math.round(Math.min(maxW, Math.max(MIN_MASK_SIZE, rect.width + dw))),
    height: Math.round(Math.min(maxH, Math.max(MIN_MASK_SIZE, rect.height + dh))),
  };
}

export const toRect = (m: Mask): Rect => ({x: m.x, y: m.y, width: m.width, height: m.height});
