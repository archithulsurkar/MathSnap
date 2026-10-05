/**
 * Geometry for user-drawn regions. Pure, so it can be tested without a DOM.
 *
 * Coordinates are fractions (0–1) of the page image, not pixels: the page is
 * shown scaled to fit the screen but cropped at its natural resolution, and a
 * fraction means the same thing at both sizes.
 */
import type { RegionKind } from './shared/remediation.types.js';

export type { RegionKind } from './shared/remediation.types.js';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Region extends Rect {
  id: string;
  kind: RegionKind;
}

export interface Size {
  width: number;
  height: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The rectangle spanned by a drag in any direction, clamped to the page. */
export function rectFromDrag(start: Point, end: Point): Rect {
  const x1 = clamp01(Math.min(start.x, end.x));
  const y1 = clamp01(Math.min(start.y, end.y));
  const x2 = clamp01(Math.max(start.x, end.x));
  const y2 = clamp01(Math.max(start.y, end.y));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Whether a drawn rectangle is too small to be deliberate, measured in screen
 * pixels at the size it was drawn. Catches clicks and slips of the pen.
 */
export function isTooSmall(rect: Rect, minPx: number, displaySize: Size): boolean {
  return rect.w * displaySize.width < minPx || rect.h * displaySize.height < minPx;
}

/**
 * The integer pixel rectangle to crop from the full-resolution image. Rounds
 * outwards, so a stroke on the box edge is kept, and never leaves the image or
 * collapses below one pixel.
 */
export function toPixelRect(rect: Rect, naturalWidth: number, naturalHeight: number): Rect {
  const left = Math.max(0, Math.floor(rect.x * naturalWidth));
  const top = Math.max(0, Math.floor(rect.y * naturalHeight));
  const right = Math.min(naturalWidth, Math.ceil((rect.x + rect.w) * naturalWidth));
  const bottom = Math.min(naturalHeight, Math.ceil((rect.y + rect.h) * naturalHeight));
  return {
    x: Math.min(left, naturalWidth - 1),
    y: Math.min(top, naturalHeight - 1),
    w: Math.max(1, right - left),
    h: Math.max(1, bottom - top),
  };
}

/**
 * A copy of `list` with the item at `index` moved by `delta` places. Out of
 * range moves are clamped, so "move up" on the first item is a no-op.
 */
export function moveRegion<T>(list: readonly T[], index: number, delta: number): T[] {
  const copy = [...list];
  if (index < 0 || index >= copy.length) return copy;
  const target = Math.min(copy.length - 1, Math.max(0, index + delta));
  const [item] = copy.splice(index, 1);
  copy.splice(target, 0, item);
  return copy;
}

/**
 * Scales a size down so its longest edge is at most `maxEdge`; never scales
 * up. Keeps a crop from a large phone photo within the upload limit.
 */
export function fitWithin(width: number, height: number, maxEdge: number): Size & { scale: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/** Total regions across every page. */
export function countRegions(regionsByPage: readonly (readonly Region[])[]): number {
  return regionsByPage.reduce((total, regions) => total + regions.length, 0);
}
