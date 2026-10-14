import { describe, expect, it } from 'vitest';
import { rotationFor } from './RouletteWheel.tsx';

/** Which slice sits under the 12 o'clock pointer after rotating clockwise by `rotation`. */
function sliceUnderPointer(rotation: number, count: number): number {
  const pointerAngle = (((360 - (rotation % 360)) % 360) + 360) % 360;
  return Math.floor(pointerAngle / (360 / count));
}

describe('rotationFor', () => {
  it('lands every slice under the pointer', () => {
    for (const count of [1, 3, 8]) {
      for (let index = 0; index < count; index += 1) {
        expect(sliceUnderPointer(rotationFor(index, count, 0), count)).toBe(index);
      }
    }
  });

  it('always spins forward by at least the requested turns from any start', () => {
    const current = 1234.5;
    const next = rotationFor(2, 8, current);
    expect(next - current).toBeGreaterThanOrEqual(5 * 360);
    expect(next - current).toBeLessThan(6 * 360);
    expect(sliceUnderPointer(next, 8)).toBe(2);
  });
});
