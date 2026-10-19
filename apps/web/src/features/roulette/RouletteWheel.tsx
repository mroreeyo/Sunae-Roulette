import { m, useReducedMotion } from 'motion/react';

const SIZE = 280;
const RADIUS = SIZE / 2;
const LABEL_RADIUS = RADIUS * 0.62;
const LABEL_MAX = 6;
/** How far the chosen slice slides out of the wheel. */
const POP_OUT = 6;

interface RouletteWheelProps {
  labels: string[];
  /** Cumulative clockwise rotation in degrees. */
  rotation: number;
  highlightIndex: number | null;
  onSpinEnd: () => void;
  /** Rendered width and height in pixels; smaller once a result needs the room. */
  size?: number;
}

function slicePath(index: number, count: number): string {
  if (count === 1) return `M ${RADIUS} 0 A ${RADIUS} ${RADIUS} 0 1 1 ${RADIUS - 0.01} 0 Z`;
  const toPoint = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${RADIUS + RADIUS * Math.cos(rad)} ${RADIUS + RADIUS * Math.sin(rad)}`;
  };
  const start = (index * 360) / count;
  const end = ((index + 1) * 360) / count;
  const largeArc = end - start > 180 ? 1 : 0;
  return `M ${RADIUS} ${RADIUS} L ${toPoint(start)} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${toPoint(end)} Z`;
}

function shorten(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max)}…` : label;
}

const SKELETON_SLICES = 8;

/**
 * The wheel's shape while places load, so the real wheel takes its place without moving.
 * `index.html` draws the same wheel as the launch screen; keep the two alike.
 */
export function WheelSkeleton() {
  return (
    <div
      className="mx-auto rounded-full shadow-[0_24px_60px_-24px_var(--shadow)] motion-safe:animate-pulse"
      style={{ width: SIZE }}
      aria-hidden="true"
    >
      <svg viewBox={`${-POP_OUT} ${-POP_OUT} ${SIZE + POP_OUT * 2} ${SIZE + POP_OUT * 2}`} width={SIZE} height={SIZE} className="block">
        {Array.from({ length: SKELETON_SLICES }, (_, i) => (
          <path
            key={i}
            d={slicePath(i, SKELETON_SLICES)}
            strokeWidth={2}
            className={`stroke-bg ${i % 2 === 0 ? 'fill-surface-2' : 'fill-surface'}`}
          />
        ))}
        <circle cx={RADIUS} cy={RADIUS} r={20} strokeWidth={1.5} className="fill-bg stroke-ink/20" />
      </svg>
    </div>
  );
}

/**
 * Rotation that brings slice `index` under the pointer at 12 o'clock,
 * always spinning forward a few full turns from `current`.
 */
export function rotationFor(index: number, count: number, current: number, turns = 5): number {
  const center = ((index + 0.5) * 360) / count;
  const target = (360 - center) % 360;
  const delta = (target - (current % 360) + 360) % 360;
  return current + turns * 360 + delta;
}

/**
 * Neutral slices so the eye goes to the one that matters: the chosen slice turns accent and
 * slides out a little once the wheel stops.
 */
export function RouletteWheel({ labels, rotation, highlightIndex, onSpinEnd, size = SIZE }: RouletteWheelProps) {
  const reduceMotion = useReducedMotion();
  const count = Math.max(labels.length, 1);
  // Labels keep about 12px on screen at any wheel size. On the small wheel shown with a result,
  // only the chosen slice keeps its (shorter) label: the others would be too small to read.
  const fontSize = (12 * (SIZE + POP_OUT * 2)) / size;
  const compact = size < 240;

  return (
    <div className="relative mx-auto" style={{ width: size }} aria-hidden="true">
      <div className="absolute left-1/2 -top-2 z-10 h-0 w-0 -translate-x-1/2 border-x-[10px] border-t-[16px] border-x-transparent border-t-accent" />
      <m.div
        className="rounded-full shadow-[0_24px_60px_-24px_var(--shadow)]"
        animate={{ rotate: rotation }}
        transition={reduceMotion ? { duration: 0 } : { duration: 2.6, ease: [0.12, 0.8, 0.18, 1] }}
        onAnimationComplete={onSpinEnd}
      >
        <svg viewBox={`${-POP_OUT} ${-POP_OUT} ${SIZE + POP_OUT * 2} ${SIZE + POP_OUT * 2}`} width={size} height={size} className="block">
          {labels.map((label, i) => {
            const angle = ((i + 0.5) * 360) / count;
            const rad = (angle * Math.PI) / 180;
            const x = RADIUS + LABEL_RADIUS * Math.sin(rad);
            const y = RADIUS - LABEL_RADIUS * Math.cos(rad);
            // Radial labels; the left half is flipped so no label reads upside down.
            const textRotation = angle <= 180 ? angle - 90 : angle + 90;
            const highlighted = i === highlightIndex;
            const shift = highlighted && count > 1 ? `translate(${POP_OUT * Math.sin(rad)} ${-POP_OUT * Math.cos(rad)})` : undefined;
            return (
              <g key={`${label}-${i}`} transform={shift}>
                <path
                  d={slicePath(i, count)}
                  strokeWidth={2}
                  className={`stroke-bg ${highlighted ? 'fill-accent' : i % 2 === 0 ? 'fill-surface-2' : 'fill-surface'}`}
                />
                {(!compact || highlighted) && (
                  <text
                    x={x}
                    y={y}
                    transform={`rotate(${textRotation} ${x} ${y})`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={fontSize}
                    className={highlighted ? 'fill-on-accent font-extrabold' : 'fill-ink-muted font-semibold'}
                  >
                    {shorten(label, compact ? LABEL_MAX - 1 : LABEL_MAX)}
                  </text>
                )}
              </g>
            );
          })}
          <circle cx={RADIUS} cy={RADIUS} r={20} strokeWidth={1.5} className="fill-bg stroke-ink/20" />
        </svg>
      </m.div>
    </div>
  );
}
