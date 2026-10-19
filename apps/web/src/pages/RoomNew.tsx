import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { fetchPreview, readNickname, rememberNickname, useCreateRoom, useRoomPreview, type PreviewCandidate } from '../features/room/api.ts';
import { deadlineFromTime, seoulTime } from '../features/room/time.ts';
import { CategoryBadge } from '../features/ui/CategoryBadge.tsx';
import { fieldClass } from '../features/ui/field.ts';

const MAX_NICKNAME = 20;

const primaryButton =
  'inline-flex min-h-[54px] w-full items-center justify-center rounded-full bg-accent px-6 text-[17px] font-extrabold text-on-accent transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export default function RoomNew() {
  const ids = { nickname: useId(), deadline: useId(), error: useId() };
  const navigate = useNavigate();
  const preview = useRoomPreview();
  const createRoom = useCreateRoom();

  // The host's swaps; until then the preview's picks are shown.
  const [picked, setPicked] = useState<PreviewCandidate[] | null>(null);
  const candidates = picked ?? preview.data?.candidates ?? null;
  const [swappedOut, setSwappedOut] = useState<string[]>([]);
  const [swapping, setSwapping] = useState<number | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [nickname, setNickname] = useState(readNickname);
  const [chosenDeadline, setDeadline] = useState<string | null>(null);
  const deadline = chosenDeadline ?? (preview.data ? seoulTime(preview.data.deadlineAt) : '');
  const [formError, setFormError] = useState<string | null>(null);

  async function swap(index: number) {
    if (!candidates) return;
    const out = candidates[index]!;
    const exclude = [...swappedOut, ...candidates.map((c) => c.placeId)];
    setSwapping(index);
    setSwapError(null);
    try {
      const next = await fetchPreview(exclude);
      // Prefer a category the other slots do not have yet.
      const others = new Set(candidates.filter((_, i) => i !== index).map((c) => c.category));
      const replacement = next.candidates.find((c) => !others.has(c.category)) ?? next.candidates[0];
      if (!replacement) {
        setSwapError('바꿀 수 있는 식당이 더 없어요.');
        return;
      }
      setSwappedOut((list) => [...list, out.placeId]);
      setPicked(candidates.map((c, i) => (i === index ? replacement : c)));
    } catch (error) {
      setSwapError(`다른 식당을 불러오지 못했어요. ${(error as Error).message}`);
    } finally {
      setSwapping(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const name = nickname.trim();
    if (!name) return setFormError('닉네임을 입력해 주세요.');
    if (!candidates?.length) return setFormError('후보가 없어서 방을 만들 수 없어요.');
    const deadlineAt = deadlineFromTime(deadline);
    if (!deadlineAt) return setFormError('마감 시각은 지금부터 12시간 안으로 골라 주세요.');
    setFormError(null);
    rememberNickname(name);
    createRoom.mutate(
      { placeIds: candidates.map((c) => c.placeId), nickname: name.slice(0, MAX_NICKNAME), deadlineAt },
      { onSuccess: (room) => navigate(`/r/${room.code}`) },
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <header className="pt-2">
        <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.035em]">팀이랑 정하기</h1>
        <p className="mt-1 text-[15px] text-ink-muted">후보 3곳으로 투표 방을 만들어요. 링크를 받은 사람은 로그인 없이 투표할 수 있어요.</p>
      </header>

      <section aria-labelledby="candidates-title" className="flex flex-col gap-2">
        <h2 id="candidates-title" className="text-[20px] font-extrabold tracking-[-0.02em]">
          후보
        </h2>
        {preview.isPending ? (
          <ul className="flex flex-col gap-2" aria-label="불러오는 중">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-[76px] animate-pulse rounded-3xl bg-surface-2" />
            ))}
          </ul>
        ) : preview.isError ? (
          <div role="alert" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
            <p className="font-semibold">후보를 불러오지 못했어요.</p>
            <p className="mt-1 text-[14px] text-ink-muted">{preview.error.message}</p>
            <button
              type="button"
              onClick={() => void preview.refetch()}
              className="mt-3 min-h-12 rounded-full bg-surface-2 px-5 text-[15px] font-semibold text-ink"
            >
              다시 시도
            </button>
          </div>
        ) : candidates && candidates.length === 0 ? (
          <p className="rounded-3xl bg-surface p-5 text-[15px] text-ink-muted ring-1 ring-line">
            지금 추천할 수 있는 식당이 없어요. 숨긴 식당이나 쿨다운 설정을 확인해 주세요.
          </p>
        ) : (
          <ol className="flex flex-col gap-2" aria-label="후보 목록">
            {candidates?.map((c, index) => (
              <li key={c.placeId} className="flex min-h-[80px] items-center gap-3.5 rounded-3xl bg-surface px-5 py-3.5 ring-1 ring-line">
                <span aria-hidden="true" className="w-6 shrink-0 text-[28px] leading-none font-extrabold tracking-[-0.04em] text-ink-muted tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-bold">{c.name}</p>
                  <div className="mt-1 flex items-center gap-2 text-[13px] text-ink-muted">
                    <CategoryBadge category={c.category} />
                    {c.walkMinutes === null ? '위치 정보 없음' : `걸어서 약 ${Math.max(1, Math.round(c.walkMinutes))}분`}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={swapping !== null || createRoom.isPending}
                  onClick={() => void swap(index)}
                  aria-label={`${c.name} 다른 식당으로 바꾸기`}
                  className="min-h-11 shrink-0 rounded-full px-4 text-[14px] font-semibold ring-1 ring-ink/15 transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {swapping === index ? '찾는 중' : '바꾸기'}
                </button>
              </li>
            ))}
          </ol>
        )}
        {candidates && candidates.length > 0 && candidates.length < 3 && (
          <p className="text-[13px] text-ink-muted">조건에 맞는 식당이 적어서 {candidates.length}곳만 골랐어요.</p>
        )}
        {swapError && (
          <p role="alert" className="text-[14px] text-accent-ink">
            {swapError}
          </p>
        )}
      </section>

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.nickname} className="text-[14px] font-semibold">
            내 닉네임
          </label>
          <input
            id={ids.nickname}
            value={nickname}
            maxLength={MAX_NICKNAME}
            onChange={(e) => setNickname(e.target.value)}
            className={fieldClass}
            autoComplete="nickname"
          />
          <p className="text-[13px] text-ink-muted">투표 방에 이 이름으로 보여요.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.deadline} className="text-[14px] font-semibold">
            마감 시각
          </label>
          <input
            id={ids.deadline}
            type="time"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className={fieldClass}
            required
          />
          <p className={`text-[13px] ${deadline || !preview.data ? 'text-ink-muted' : 'text-accent-ink'}`}>
            {deadline || !preview.data ? '마감이 되면 가장 많이 받은 곳으로 자동 확정돼요.' : '마감 시각을 골라 주세요.'}
          </p>
        </div>

        {(formError || createRoom.isError) && (
          <p id={ids.error} role="alert" className="text-[14px] text-accent-ink">
            {formError ?? `방을 만들지 못했어요. ${createRoom.error?.message ?? ''}`}
          </p>
        )}

        <button type="submit" className={primaryButton} disabled={!candidates?.length || !deadline || createRoom.isPending}>
          {createRoom.isPending ? '만드는 중' : '투표 방 만들기'}
        </button>
      </form>
    </div>
  );
}
