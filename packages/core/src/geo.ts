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
