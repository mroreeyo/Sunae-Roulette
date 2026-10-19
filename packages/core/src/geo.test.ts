import { describe, expect, it } from 'vitest';
import { compassDirection, distanceMeters, offsetMeters } from './geo.ts';

// 수내역 (app_config) and two places around it, from the public data.
const STATION = { lat: 37.3784, lng: 127.1143 };
const SOUTH_EAST = { lat: 37.3763236, lng: 127.1167029 };
const WEST = { lat: 37.3780368, lng: 127.1119035 };

describe('offsetMeters', () => {
  it('agrees with the great-circle distance nearby', () => {
    const { east, north } = offsetMeters(STATION, SOUTH_EAST);
    expect(Math.hypot(east, north)).toBeCloseTo(distanceMeters(STATION, SOUTH_EAST), 0);
    expect(east).toBeGreaterThan(0);
    expect(north).toBeLessThan(0);
  });
});

describe('compassDirection', () => {
  it('names the eight directions', () => {
    expect(compassDirection(STATION, SOUTH_EAST)).toBe('남동');
    expect(compassDirection(STATION, WEST)).toBe('서');
    expect(compassDirection(STATION, { lat: 37.38, lng: 127.1143 })).toBe('북');
    expect(compassDirection(STATION, { lat: 37.3784, lng: 127.12 })).toBe('동');
  });

  it('calls the same point north', () => {
    expect(compassDirection(STATION, STATION)).toBe('북');
  });
});
