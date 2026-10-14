import { m, useReducedMotion } from 'motion/react';

const SIZE = 280;
const RADIUS = SIZE / 2;
const LABEL_RADIUS = RADIUS * 0.62;
const LABEL_MAX = 6;

interface RouletteWheelProps {
  labels: string[];
  /** Cumulative clockwise rotation in degrees. */
  rotation: number;
  highlightIndex: number | null;
  onSpinEnd: () => void;
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

function shorten(label: string): string {
  return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX)}…` : label;
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

export function RouletteWheel({ labels, rotation, highlightIndex, onSpinEnd }: RouletteWheelProps) {
  const reduceMotion = useReducedMotion();
  const count = Math.max(labels.length, 1);

  return (
    <div className="relative mx-auto w-[280px]" aria-hidden="true">
      <div className="absolute left-1/2 -top-2 z-10 h-0 w-0 -translate-x-1/2 border-x-[10px] border-t-[16px] border-x-transparent border-t-accent" />
      <m.div
        className="rounded-full shadow-[0_24px_60px_-24px_var(--shadow)] ring-1 ring-line"
        animate={{ rotate: rotation }}
        transition={reduceMotion ? { duration: 0 } : { duration: 2.6, ease: [0.12, 0.8, 0.18, 1] }}
        onAnimationComplete={onSpinEnd}
      >
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="block">
          {labels.map((label, i) => {
            const angle = ((i + 0.5) * 360) / count;
            const rad = (angle * Math.PI) / 180;
            const x = RADIUS + LABEL_RADIUS * Math.sin(rad);
            const y = RADIUS - LABEL_RADIUS * Math.cos(rad);
            // Radial labels; the left half is flipped so no label reads upside down.
            const textRotation = angle <= 180 ? angle - 90 : angle + 90;
            const highlighted = i === highlightIndex;
            return (
              <g key={`${label}-${i}`}>
                <path
                  d={slicePath(i, count)}
                  // Slightly translucent so the photo's afterimage shows through while spinning.
                  className={highlighted ? 'fill-accent-soft' : i % 2 === 0 ? 'fill-surface/85' : 'fill-surface-2/85'}
                />
                <text
                  x={x}
                  y={y}
                  transform={`rotate(${textRotation} ${x} ${y})`}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={`text-[12px] font-medium ${highlighted ? 'fill-accent-ink' : 'fill-ink'}`}
                >
                  {shorten(label)}
                </text>
              </g>
            );
          })}
          <circle cx={RADIUS} cy={RADIUS} r={18} className="fill-surface stroke-line" />
        </svg>
      </m.div>
    </div>
  );
}
