export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Room left between the lit target and the card, and between the card and the screen edge. */
export const GAP = 12;
export const EDGE = 16;

/** The lit area: the target plus padding, kept on screen. */
export function spotlightBox(target: Box, viewport: { width: number; height: number }, pad: number): Box {
  const top = Math.max(target.top - pad, 0);
  const left = Math.max(target.left - pad, 0);
  const bottom = Math.min(target.top + target.height + pad, viewport.height);
  const right = Math.min(target.left + target.width + pad, viewport.width);
  return { top, left, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) };
}

/**
 * Where the explanation card goes: below the lit area if it fits, else above, else on the side
 * with more room, clamped to the screen (it then covers part of the target).
 */
export function cardTop(spot: Box, cardHeight: number, viewportHeight: number): number {
  const below = spot.top + spot.height + GAP;
  if (below + cardHeight <= viewportHeight - EDGE) return below;
  const above = spot.top - GAP - cardHeight;
  if (above >= EDGE) return above;
  const roomBelow = viewportHeight - (spot.top + spot.height);
  const preferred = roomBelow >= spot.top ? below : above;
  return Math.min(Math.max(preferred, EDGE), Math.max(viewportHeight - EDGE - cardHeight, EDGE));
}
