/**
 * "걸어서 6분" with the minutes set large like the numbers painted on Bundang's apartment
 * blocks. Screen readers get one plain sentence instead of three fragments.
 */
export function WalkTime({ minutes, detail }: { minutes: number | null; detail: string | null }) {
  if (minutes === null) {
    return <p className="pt-4 text-[15px] text-ink-muted">도보 시간 알 수 없음</p>;
  }
  const rounded = Math.max(1, Math.round(minutes));
  return (
    <p className="flex flex-col gap-0.5 pt-4">
      <span className="sr-only">
        걸어서 약 {rounded}분{detail ? `, ${detail}` : ''}
      </span>
      <span aria-hidden="true" className="text-[13px] text-ink-muted">
        걸어서
      </span>
      <span aria-hidden="true" className="flex items-baseline gap-1">
        <span className="text-[52px] leading-[0.95] font-extrabold tracking-[-0.03em] tabular-nums">{rounded}</span>
        <span className="text-[17px] font-extrabold">분</span>
      </span>
      {detail && (
        <span aria-hidden="true" className="text-[13px] text-ink-muted">
          {detail}
        </span>
      )}
    </p>
  );
}
