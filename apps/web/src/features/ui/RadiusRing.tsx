import { compassDirection, distanceMeters, offsetMeters, type LatLng } from '@lunch/core';

/** "남동쪽 310m" from the station, or "바로 앞" right next to it. */
export function directionText(base: LatLng, point: LatLng): string {
  const meters = Math.round(distanceMeters(base, point) / 10) * 10;
  return meters < 30 ? '바로 앞' : `${compassDirection(base, point)}쪽 ${meters}m`;
}

/** "수내역에서 남동쪽 310m" */
export function bearingText(baseName: string, base: LatLng, point: LatLng): string {
  const direction = directionText(base, point);
  return direction === '바로 앞' ? `${baseName} 바로 앞` : `${baseName}에서 ${direction}`;
}

interface RadiusRingProps {
  base: LatLng;
  baseName: string;
  point: LatLng;
  radiusM: number;
  size: number;
}

const CENTER = 100;
const RING = 86;

/**
 * The app's search radius around the station, with the place as a dot: where it is, not just
 * how far. Drawn from stored coordinates only; no map service is involved.
 */
export function RadiusRing({ base, baseName, point, radiusM, size }: RadiusRingProps) {
  const { east, north } = offsetMeters(base, point);
  const meters = Math.hypot(east, north);
  // A place just outside the radius still sits on the ring rather than off the drawing.
  const scale = (RING / radiusM) * Math.min(1, radiusM / Math.max(meters, 1));
  const x = CENTER + east * scale;
  const y = CENTER - north * scale;

  return (
    <svg
      role="img"
      aria-label={`${baseName} 기준 반경 ${radiusM}m 지도에서 ${bearingText(baseName, base, point)}`}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className="block"
    >
      <circle cx={CENTER} cy={CENTER} r={96} className="fill-surface-2" />
      <circle cx={CENTER} cy={CENTER} r={RING} fill="none" strokeWidth={1.5} className="stroke-ink/30" />
      <circle cx={CENTER} cy={CENTER} r={RING / 2} fill="none" strokeWidth={1.2} strokeDasharray="3 5" className="stroke-ink/15" />
      <text x={CENTER} y={34} textAnchor="middle" className="fill-ink-muted text-[16px] font-bold">
        N
      </text>
      <text x={CENTER} y={176} textAnchor="middle" className="fill-ink-muted text-[14px] font-semibold">
        {radiusM}m
      </text>
      <line x1={CENTER} y1={CENTER} x2={x} y2={y} strokeWidth={2} strokeDasharray="4 4" className="stroke-ink/45" />
      <circle cx={CENTER} cy={CENTER} r={8} className="fill-ink" />
      <circle cx={CENTER} cy={CENTER} r={15} fill="none" strokeWidth={1.5} className="stroke-ink/35" />
      <circle cx={x} cy={y} r={13} strokeWidth={4} className="fill-accent stroke-surface-2" />
    </svg>
  );
}
