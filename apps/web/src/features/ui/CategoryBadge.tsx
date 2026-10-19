/**
 * A place's category as an outlined pill. Categories stay neutral outside the history stats, so
 * a screen's only colour is its one point of focus.
 */
export function CategoryBadge({ category, onPanel = false }: { category: string; onPanel?: boolean }) {
  return (
    <span
      data-testid="category"
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[12px] font-bold ring-1 ${
        onPanel ? 'text-on-panel-muted ring-on-panel/25' : 'text-ink-muted ring-ink/20'
      }`}
    >
      {category}
    </span>
  );
}
