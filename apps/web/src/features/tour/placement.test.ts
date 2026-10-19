import { describe, expect, it } from 'vitest';
import { cardTop, EDGE, GAP, spotlightBox } from './placement.ts';

const viewport = { width: 390, height: 800 };

describe('spotlightBox', () => {
  it('pads the target', () => {
    expect(spotlightBox({ top: 100, left: 20, width: 200, height: 50 }, viewport, 8)).toEqual({
      top: 92,
      left: 12,
      width: 216,
      height: 66,
    });
  });

  it('stays on screen', () => {
    expect(spotlightBox({ top: 760, left: 0, width: 390, height: 60 }, viewport, 8)).toEqual({
      top: 752,
      left: 0,
      width: 390,
      height: 48,
    });
  });
});

describe('cardTop', () => {
  it('goes below the target when it fits', () => {
    expect(cardTop({ top: 100, left: 0, width: 100, height: 50 }, 200, 800)).toBe(150 + GAP);
  });

  it('goes above a target near the bottom', () => {
    expect(cardTop({ top: 720, left: 0, width: 100, height: 70 }, 200, 800)).toBe(720 - GAP - 200);
  });

  it('stays on screen when neither side fits', () => {
    const top = cardTop({ top: 100, left: 0, width: 100, height: 600 }, 300, 800);
    expect(top).toBeGreaterThanOrEqual(EDGE);
    expect(top + 300).toBeLessThanOrEqual(800 - EDGE);
  });
});
