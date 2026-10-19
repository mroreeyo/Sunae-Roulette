import type { LatLng } from './types.ts';

const EARTH_RADIUS_M = 6_371_008.8;

/** 4 km/h walking speed. */
export const WALK_METERS_PER_MINUTE = 67;
/** Straight-line distance understates the real walking route. */
export const ROUTE_FACTOR = 1.3;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function walkMinutes(meters: number): number {
  return (meters * ROUTE_FACTOR) / WALK_METERS_PER_MINUTE;
}

export type CompassDirection = '북' | '북동' | '동' | '남동' | '남' | '남서' | '서' | '북서';

const COMPASS: CompassDirection[] = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];

/**
 * How far `to` lies east and north of `from`, in meters. Fine for the few hundred meters around
 * one station: the earth is treated as flat there.
 */
export function offsetMeters(from: LatLng, to: LatLng): { east: number; north: number } {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const north = toRad(to.lat - from.lat) * EARTH_RADIUS_M;
  const east = toRad(to.lng - from.lng) * EARTH_RADIUS_M * Math.cos(toRad((from.lat + to.lat) / 2));
  return { east, north };
}

/** Which of eight directions `to` lies in, seen from `from` ("남동" for south-east). */
export function compassDirection(from: LatLng, to: LatLng): CompassDirection {
  const { east, north } = offsetMeters(from, to);
  const degrees = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(degrees / 45) % 8]!;
}
