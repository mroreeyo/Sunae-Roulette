import { toSeoulDate } from '@lunch/core';
import { useMutation } from '@tanstack/react-query';
import {
  saveMealOptions,
  useDismissFailedSave,
  useFailedUnwatchedSaves,
  usePlaces,
  type FailedSave,
} from '../data/queries.ts';

const buttonBase =
  'inline-flex min-h-12 items-center justify-center rounded-full px-5 text-[15px] font-semibold transition-transform duration-200 ease-soft active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

function dayLabel(eatenOn: string): string {
  if (eatenOn === toSeoulDate(new Date())) return '오늘';
  const [, month, day] = eatenOn.split('-').map(Number);
  return `${month}월 ${day}일`;
}

/**
 * Saves that failed with no result card showing them: queued offline and sent when the app was
 * opened again, or still waiting when the user moved to another tab. Without this notice the
 * meal would be lost without a word.
 */
export function FailedSaveNotices() {
  const failures = useFailedUnwatchedSaves();
  const places = usePlaces();
  return (
    <>
      {failures.map((failure) => (
        <FailedSaveNotice
          key={failure.input.eatenOn}
          failure={failure}
          placeName={places.data?.find((p) => p.id === failure.input.placeId)?.name ?? null}
        />
      ))}
    </>
  );
}

function FailedSaveNotice({ failure, placeName }: { failure: FailedSave; placeName: string | null }) {
  // A retry is watched here; once it succeeds, the failed save is removed and this notice goes away.
  const retry = useMutation(saveMealOptions);
  const dismiss = useDismissFailedSave();
  const message = retry.error?.message ?? failure.message;
  const place = placeName ?? '식당';
  const cause = failure.restored
    ? `오프라인일 때 고른 ${place} 기록을 앱을 다시 열면서 보냈는데 저장되지 않았어요.`
    : `룰렛 화면을 떠난 사이에 보낸 ${place} 기록이 저장되지 않았어요.`;

  return (
    <div role="alert" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
      <p className="font-semibold break-keep">{dayLabel(failure.input.eatenOn)} 점심을 기록하지 못했어요.</p>
      <p className="mt-1 text-[14px] break-keep text-ink-muted">
        {retry.isPaused
          ? '지금은 오프라인이에요. 연결되면 바로 기록할게요.'
          : `${cause} 연결을 확인하고 다시 기록해 주세요.${
              message && !retry.isPending ? ` (${message})` : ''
            }`}
      </p>
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          className={`${buttonBase} bg-accent text-on-accent disabled:opacity-60`}
          onClick={() => retry.mutate(failure.input)}
          disabled={retry.isPending}
        >
          {retry.isPaused ? '연결 기다리는 중' : retry.isPending ? '기록하는 중' : '다시 기록하기'}
        </button>
        <button type="button" className={`${buttonBase} bg-surface-2 text-ink`} onClick={() => dismiss(failure.input.eatenOn)}>
          닫기
        </button>
      </div>
    </div>
  );
}
