import type { ReactNode } from 'react';

interface ChipProps {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  /** "exclude" chips read as struck out when pressed (e.g. 한식 빼고). */
  variant?: 'include' | 'exclude';
  disabled?: boolean;
  label?: string;
}

export function Chip({ pressed, onClick, children, variant = 'include', disabled, label }: ChipProps) {
  const pressedStyle =
    variant === 'include'
      ? 'bg-panel text-on-panel ring-panel'
      : 'bg-surface-2 text-ink-muted line-through ring-line';
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[14px] font-semibold ring-1 transition-[transform,background-color,color] duration-200 ease-soft active:scale-[0.97] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        pressed ? pressedStyle : 'bg-transparent text-ink ring-ink/15'
      }`}
    >
      {children}
    </button>
  );
}
