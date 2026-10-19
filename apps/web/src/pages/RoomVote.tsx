import { distanceMeters, toSeoulDate, walkMinutes } from '@lunch/core';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useAppConfig, useRecentMeals, useSession } from '../features/data/queries.ts';
import {
  readNickname,
  rememberNickname,
  ROOM_NOT_FOUND,
  useCloseRoomNow,
  useJoinRoom,
  useRecordRoomMeal,
  useRoom,
  useRoomRealtime,
  useVote,
  type Room,
  type RoomCandidate,
} from '../features/room/api.ts';
import { formatRemaining, remainingParts, seoulDayLabel, seoulTime, useNow } from '../features/room/time.ts';
import { CategoryBadge } from '../features/ui/CategoryBadge.tsx';
import { fieldClass } from '../features/ui/field.ts';
import { bearingText, directionText, RadiusRing } from '../features/ui/RadiusRing.tsx';
import { WalkTime } from '../features/ui/WalkTime.tsx';
import { kakaoMapUrl, naverMapUrl } from '../lib/mapLinks.ts';

const MAX_NICKNAME = 20;
/** The result's heading, which takes focus when a close removes the control that had it. */
const RESULT_HEADING_ID = 'room-result-title';

const primaryButton =
  'inline-flex min-h-[54px] w-full items-center justify-center rounded-full bg-accent px-6 text-[17px] font-extrabold text-on-accent transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const secondaryButton =
  'inline-flex min-h-12 items-center justify-center rounded-full bg-surface-2 px-5 text-[15px] font-semibold text-ink transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const accentButton =
  'inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const outlineButton =
  'inline-flex min-h-12 items-center justify-center rounded-full px-5 text-[15px] font-semibold text-ink ring-1 ring-ink/15 transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const mapButton =
  'inline-flex min-h-12 items-center justify-center rounded-full px-5 text-[15px] font-semibold text-on-brand transition-transform duration-200 ease-soft active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

function joinErrorText(error: Error): string {
  return error.message === ROOM_NOT_FOUND
    ? '방을 찾을 수 없어요. 링크가 맞는지, 이미 마감된 방은 아닌지 확인해 주세요.'
    : `입장하지 못했어요. ${error.message}`;
}

/** A new code starts from scratch, so a room never shows under another room's link. */
export default function RoomVoteRoute() {
  const { code = '' } = useParams();
  return <RoomVote key={code} code={code} />;
}

interface Joined {
  roomId: string;
  userId: string | null;
}

function RoomVote({ code }: { code: string }) {
  const session = useSession();
  const join = useJoinRoom();
  const [joined, setJoined] = useState<Joined | null>(null);
  // Someone who already has a nickname on this device goes straight in (also the host, who joined
  // when making the room).
  const [savedNickname] = useState(readNickname);
  const { isIdle, mutate } = join;

  useEffect(() => {
    if (session.isSuccess && savedNickname && isIdle) mutate({ code, nickname: savedNickname }, { onSuccess: setJoined });
  }, [session.isSuccess, savedNickname, isIdle, mutate, code]);

  // After an email login switches the user, the room was joined as someone else: join again.
  const sameUser = !joined || !session.data || joined.userId === session.data.id;
  if (joined && sameUser) return <RoomView roomId={joined.roomId} myId={joined.userId} />;
  // Without a session (sign-in failed) the form is shown, and joining signs in again.
  if (join.isPending || (savedNickname && join.isIdle && !session.isError)) {
    return (
      <div className="flex flex-col gap-3 pt-2" aria-label="불러오는 중">
        <div className="h-8 w-40 animate-pulse rounded-full bg-surface-2" />
        {join.isPaused && (
          <p role="status" className="text-[15px] text-ink-muted">
            지금은 오프라인이에요. 연결되면 바로 입장할게요.
          </p>
        )}
        <div className="h-[220px] animate-pulse rounded-3xl bg-surface-2" />
      </div>
    );
  }
  return (
    <JoinForm
      error={join.error}
      onJoin={(nickname) => {
        rememberNickname(nickname);
        join.mutate({ code, nickname }, { onSuccess: setJoined });
      }}
    />
  );
}

function JoinForm({ error, onJoin }: { error: Error | null; onJoin: (nickname: string) => void }) {
  const ids = { nickname: useId(), hint: useId() };
  const [nickname, setNickname] = useState(readNickname);
  const [touched, setTouched] = useState(false);
  const trimmed = nickname.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (trimmed) onJoin(trimmed.slice(0, MAX_NICKNAME));
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <header className="pt-2">
        <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.035em]">점심 투표에 초대받았어요</h1>
        <p className="mt-1 text-[15px] text-ink-muted">닉네임만 정하면 바로 투표할 수 있어요. 로그인은 필요 없어요.</p>
      </header>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-3xl bg-surface p-5 ring-1 ring-line">
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.nickname} className="text-[14px] font-semibold">
            닉네임
          </label>
          <input
            id={ids.nickname}
            value={nickname}
            maxLength={MAX_NICKNAME}
            onChange={(e) => setNickname(e.target.value)}
            aria-invalid={touched && !trimmed}
            aria-describedby={ids.hint}
            className={fieldClass}
            autoComplete="nickname"
          />
          <p id={ids.hint} className={`text-[13px] ${touched && !trimmed ? 'text-accent-ink' : 'text-ink-muted'}`}>
            {touched && !trimmed ? '닉네임을 입력해 주세요.' : '다른 사람에게 이 이름으로 보여요.'}
          </p>
        </div>
        {error && (
          <p role="alert" className="text-[14px] text-accent-ink">
            {joinErrorText(error)}
          </p>
        )}
        <button type="submit" className={primaryButton}>
          입장하기
        </button>
      </form>
    </div>
  );
}

function RoomView({ roomId, myId }: { roomId: string; myId: string | null }) {
  const room = useRoom(roomId);
  useRoomRealtime(roomId);

  if (room.isPending) {
    return <div className="mt-2 h-[320px] animate-pulse rounded-3xl bg-surface-2" aria-label="불러오는 중" />;
  }
  if (room.isError) {
    return (
      <p role="alert" className="mt-2 rounded-3xl bg-surface p-5 ring-1 ring-line">
        방을 불러오지 못했어요. ({room.error.message})
      </p>
    );
  }
  return <RoomBody room={room.data} myId={myId} />;
}

function CheckIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M5 12.5 L10 17.5 L19 7" />
    </svg>
  );
}

function RoomBody({ room, myId }: { room: Room; myId: string | null }) {
  const config = useAppConfig();
  const vote = useVote(room.id);
  const now = useNow(room.status === 'open');
  const remaining = new Date(room.deadlineAt).getTime() - now;
  const votingOpen = room.status === 'open' && remaining > 0;
  const myVote = myId ? room.votes.get(myId) : undefined;

  const counts = new Map<string, number>();
  for (const candidateId of room.votes.values()) counts.set(candidateId, (counts.get(candidateId) ?? 0) + 1);
  const winner = room.candidates.find((c) => c.placeId === room.winnerPlaceId) ?? null;

  // Closing (by the host or at the deadline) removes the vote and close buttons. If one of them
  // had focus, the result heading takes it so keyboard and screen reader users are not dropped
  // at the top of the page.
  const wasOpen = useRef(room.status === 'open');
  useEffect(() => {
    if (room.status !== 'closed' || !wasOpen.current) return;
    wasOpen.current = false;
    if (!document.activeElement || document.activeElement === document.body) {
      document.getElementById(RESULT_HEADING_ID)?.focus();
    }
  }, [room.status]);

  function minutesTo(c: RoomCandidate): number | null {
    if (!config.data || c.lat === null || c.lng === null) return null;
    return walkMinutes(distanceMeters(config.data.base, { lat: c.lat, lng: c.lng }));
  }

  function whereText(c: RoomCandidate): string {
    const minutes = minutesTo(c);
    if (minutes === null || !config.data || c.lat === null || c.lng === null) return '위치 정보 없음';
    return `걸어서 ${Math.max(1, Math.round(minutes))}분 · ${directionText(config.data.base, { lat: c.lat, lng: c.lng })}`;
  }

  const turnout = `${room.members.length}명 중 ${room.votes.size}명 투표`;

  return (
    <div className="flex flex-col gap-5 pb-4">
      <header className="flex items-baseline justify-between gap-3 pt-2">
        <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.035em]">오늘 점심 투표</h1>
        {room.status === 'closed' && <p className="shrink-0 text-[14px] font-bold text-ink-muted">마감됨</p>}
        {/* The countdown ticks every second, so only the phase changes are announced. */}
        <p role="status" className="sr-only">
          {room.status === 'closed'
            ? winner
              ? `투표가 끝났어요. 결과는 ${winner.name}입니다.`
              : '투표가 끝났어요. 정해진 곳이 없어요.'
            : votingOpen
              ? ''
              : '투표를 마감했어요. 결과를 정리하는 중이에요.'}
        </p>
      </header>

      {votingOpen && <Countdown deadlineAt={room.deadlineAt} remaining={remaining} />}
      {room.status === 'open' && !votingOpen && (
        <p className="rounded-3xl bg-surface p-5 text-[15px] font-semibold ring-1 ring-line">투표를 마감했어요. 결과를 정리하는 중이에요.</p>
      )}

      {room.status === 'closed' && (
        <Result room={room} winner={winner} winnerVotes={winner ? (counts.get(winner.id) ?? 0) : 0} minutes={winner ? minutesTo(winner) : null} />
      )}

      {votingOpen && <SharePanel code={room.code} />}

      {votingOpen && myId === room.hostId && <HostClose room={room} />}

      {room.status === 'closed' ? (
        <section aria-labelledby="tally-title" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="tally-title" className="text-[17px] font-extrabold">
              득표
            </h2>
            <p className="text-[13px] font-bold text-ink-muted">{turnout}</p>
          </div>
          <div className="mt-3">
            <VoteShare room={room} counts={counts} />
          </div>
          <ol aria-label="후보별 득표" className="mt-4 flex flex-col gap-3">
            {[...room.candidates]
              .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.position - b.position)
              .map((c) => {
                const count = counts.get(c.id) ?? 0;
                return (
                  <li key={c.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3">
                    <span className="flex items-baseline gap-0.5">
                      <span className={`text-[34px] leading-none font-extrabold tracking-[-0.04em] tabular-nums ${count === 0 ? 'text-ink-faint' : ''}`}>
                        {count}
                      </span>
                      <span className="text-[13px] font-extrabold text-ink-muted">표</span>
                    </span>
                    <span className={`truncate text-[16px] font-bold ${count === 0 ? 'text-ink-muted' : ''}`}>{c.name}</span>
                    <CategoryBadge category={c.category} />
                  </li>
                );
              })}
          </ol>
        </section>
      ) : (
        <section aria-labelledby="candidates-title" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="candidates-title" className="text-[20px] font-extrabold tracking-[-0.02em]">
              후보
            </h2>
            <p className="text-[14px] font-bold text-ink-muted">{turnout}</p>
          </div>
          <VoteShare room={room} counts={counts} />
          {/* Above the list, so it shows right where the vote button was tapped. Kept in the
              accessibility tree while empty so the first message is announced. */}
          <p role="status" className="text-[14px] leading-relaxed empty:sr-only">
            {votingOpen && myVote !== undefined
              ? `투표했어요. ${seoulTime(room.deadlineAt)}에 가장 많은 표를 받은 곳으로 정해지고, 마감 전까지는 다른 곳으로 바꿀 수 있어요. 결과는 이 화면과 홈에서 볼 수 있어요.`
              : ''}
          </p>
          {vote.isError && (
            <p role="alert" className="text-[14px] text-accent-ink">
              투표하지 못했어요. {vote.error.message}
            </p>
          )}
          <ol className="flex flex-col gap-2.5" aria-label="후보 목록">
            {room.candidates.map((c) => {
              const count = counts.get(c.id) ?? 0;
              const mine = myVote === c.id;
              return (
                <li key={c.id} className={`flex flex-col gap-4 rounded-3xl bg-surface p-5 ${mine ? 'ring-[1.5px] ring-panel' : 'ring-1 ring-line'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col items-start gap-1.5">
                      <CategoryBadge category={c.category} />
                      <p className="text-[20px] leading-snug font-extrabold tracking-[-0.02em] break-keep">{c.name}</p>
                      <p className="text-[13px] text-ink-muted">{whereText(c)}</p>
                    </div>
                    <p className="flex shrink-0 items-baseline gap-0.5">
                      <span className={`text-[48px] leading-[0.9] font-extrabold tracking-[-0.04em] tabular-nums ${count === 0 ? 'text-ink-faint' : ''}`}>
                        {count}
                      </span>
                      <span className="text-[15px] font-extrabold text-ink-muted">표</span>
                    </p>
                  </div>
                  {votingOpen && (
                    <button
                      type="button"
                      aria-pressed={mine}
                      aria-label={`${c.name} ${mine ? '내가 고른 곳' : '여기 투표'}`}
                      disabled={vote.isPending}
                      onClick={() => vote.mutate(c.id)}
                      className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold transition-[transform,background-color] duration-200 ease-soft active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        mine ? 'bg-panel text-on-panel' : 'text-ink ring-1 ring-ink/15'
                      }`}
                    >
                      {mine && <CheckIcon size={18} />}
                      {mine ? '내가 고른 곳' : '여기 투표'}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {room.status === 'open' && (
        <section aria-labelledby="members-title" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <h2 id="members-title" className="text-[15px] font-bold">
            참여한 사람 {room.members.length}명
          </h2>
          <ul className="mt-3 grid grid-cols-4 gap-x-2 gap-y-4" aria-label="참여한 사람">
            {room.members.map((m) => {
              const voted = room.votes.has(m.userId);
              return (
                <li key={m.userId} className="flex flex-col items-center gap-1.5 text-center text-[13px] leading-snug">
                  <span
                    aria-hidden="true"
                    className={`relative flex size-11 items-center justify-center rounded-full bg-surface-2 text-[16px] font-extrabold ring-2 ${
                      voted ? 'ring-panel' : 'text-ink-muted ring-ink/15'
                    }`}
                  >
                    {m.nickname.slice(0, 1)}
                    {voted && (
                      <span className="absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-full bg-panel text-on-panel">
                        <CheckIcon size={11} />
                      </span>
                    )}
                  </span>
                  <span className="break-all">
                    {m.nickname}
                    {m.userId === myId && <span className="text-ink-muted"> (나)</span>}
                  </span>
                  <span className={voted ? 'font-semibold' : 'text-ink-muted'}>{voted ? '투표함' : '아직'}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {room.status === 'open' && (
        <Link to="/" className="mx-auto inline-flex min-h-11 items-center px-3 text-[14px] text-ink-muted underline underline-offset-4">
          혼자 룰렛 돌리러 가기
        </Link>
      )}
    </div>
  );
}

/** The one point of focus while a vote runs: how long is left. */
function Countdown({ deadlineAt, remaining }: { deadlineAt: string; remaining: number }) {
  return (
    <section aria-label="남은 시간" className="flex flex-col gap-2 rounded-3xl bg-accent px-5 pt-4 pb-5 text-on-accent">
      <div className="flex items-baseline justify-between text-[14px] font-bold">
        <span aria-hidden="true">남은 시간</span>
        <span>
          <span className="text-[18px] font-extrabold tabular-nums">{seoulTime(deadlineAt)}</span> 마감
        </span>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2.5">
        <span className="sr-only">{formatRemaining(remaining)} 남음</span>
        {remainingParts(remaining).map(([value, unit]) => (
          <span key={unit} aria-hidden="true" className="flex items-baseline gap-1">
            <span className="text-[68px] leading-[0.9] font-extrabold tracking-[-0.04em] tabular-nums">{value}</span>
            <span className="text-[22px] font-extrabold">{unit}</span>
          </span>
        ))}
      </p>
    </section>
  );
}

/** One bar split by votes: the leader bright, the rest grey. Nothing to draw before the first vote. */
function VoteShare({ room, counts }: { room: Room; counts: Map<string, number> }) {
  const parts = room.candidates
    .map((c) => ({ c, n: counts.get(c.id) ?? 0 }))
    .filter((p) => p.n > 0)
    .sort((a, b) => b.n - a.n);
  if (parts.length === 0) return null;
  const top = parts[0]!.n;
  return (
    <div role="img" aria-label={`득표: ${parts.map((p) => `${p.c.name} ${p.n}표`).join(', ')}`} className="flex h-3.5 gap-1">
      {parts.map((p) => (
        <span key={p.c.id} className={`rounded-full ${p.n === top ? 'bg-panel' : 'bg-ink-faint'}`} style={{ flexGrow: p.n }} />
      ))}
    </div>
  );
}

/** The host can end the vote early, which matters most once everyone has voted. */
function HostClose({ room }: { room: Room }) {
  const close = useCloseRoomNow(room.id);
  const [confirmRequested, setConfirmRequested] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const warningId = useId();
  const waiting = room.members.filter((m) => !room.votes.has(m.userId)).length;
  const allVoted = waiting === 0 && room.votes.size > 0;
  // If everyone votes while the warning is up, there is nothing left to warn about.
  const confirming = confirmRequested && !allVoted;

  // Focus follows the swap between the trigger and the confirm buttons.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
    else if (wasConfirming.current) trigger.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  const message = allVoted
    ? '모두 투표했어요. 지금 마감할까요?'
    : room.votes.size === 0
      ? '아직 아무도 투표하지 않았어요. 지금 마감하면 정해지는 곳이 없어요.'
      : `${waiting}명이 아직 투표하지 않았어요.`;

  return (
    <section aria-labelledby="host-close-title" className={`rounded-3xl bg-surface px-5 py-4 ring-1 ${allVoted ? 'ring-accent' : 'ring-line'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="host-close-title" className="text-[15px] font-bold">
            진행자 메뉴
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-muted">{message}</p>
        </div>
        {!confirming && (
          <button
            ref={trigger}
            type="button"
            className={`${allVoted ? accentButton : secondaryButton} shrink-0 px-4 text-[14px]`}
            disabled={close.isPending}
            onClick={() => (allVoted ? close.mutate() : setConfirmRequested(true))}
          >
            {close.isPending ? '마감하는 중' : '지금 마감하기'}
          </button>
        )}
      </div>
      {confirming && (
        <div className="mt-3 flex flex-col gap-2">
          <p id={warningId} className="text-[14px] font-semibold">
            지금 마감하면 아직 투표하지 않은 사람은 투표할 수 없어요.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              ref={confirmButton}
              type="button"
              aria-describedby={warningId}
              className={accentButton}
              disabled={close.isPending}
              onClick={() => close.mutate()}
            >
              {close.isPending ? '마감하는 중' : '그래도 마감하기'}
            </button>
            <button type="button" className={secondaryButton} disabled={close.isPending} onClick={() => setConfirmRequested(false)}>
              취소
            </button>
          </div>
        </div>
      )}
      {close.isError && (
        <p role="alert" className="mt-2 text-[14px] text-accent-ink">
          마감하지 못했어요. {close.error.message}
        </p>
      )}
    </section>
  );
}

function SharePanel({ code }: { code: string }) {
  const url = `${window.location.origin}/r/${code}`;
  const [status, setStatus] = useState('');
  const canShare = typeof navigator.share === 'function';

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('링크를 복사했어요. 메신저에 붙여 넣어 주세요.');
    } catch {
      setStatus('복사하지 못했어요. 링크를 길게 눌러 직접 복사해 주세요.');
    }
  }

  return (
    <section aria-labelledby="share-title" className="flex flex-col gap-3 rounded-3xl bg-surface p-5 ring-1 ring-line">
      <div>
        <h2 id="share-title" className="text-[15px] font-bold">
          팀원 초대하기
        </h2>
        <p className="mt-0.5 break-all text-[13px] text-ink-muted select-all">{url}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void copy()} className={secondaryButton}>
          링크 복사
        </button>
        {canShare && (
          <button
            type="button"
            onClick={() => void navigator.share({ title: '오늘 점심 투표', url }).catch(() => undefined)}
            className={outlineButton}
          >
            공유하기
          </button>
        )}
      </div>
      <p role="status" className="text-[13px] text-ink-muted empty:sr-only">
        {status}
      </p>
    </section>
  );
}

/** What to do when the result is not the plan: decide alone, or vote again with new candidates. */
function NextSteps({ primary }: { primary: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Link to="/" className={primary ? accentButton : outlineButton}>
        룰렛으로 정하기
      </Link>
      <Link to="/rooms/new" className={outlineButton}>
        새 투표 방 만들기
      </Link>
    </div>
  );
}

interface ResultProps {
  room: Room;
  winner: RoomCandidate | null;
  winnerVotes: number;
  minutes: number | null;
}

function Result({ room, winner, winnerVotes, minutes }: ResultProps) {
  const config = useAppConfig();
  if (!winner) {
    return (
      <section aria-labelledby={RESULT_HEADING_ID} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id={RESULT_HEADING_ID} tabIndex={-1} className="text-[19px] font-extrabold outline-none">
          아무도 투표하지 않아 정해지지 않았어요.
        </h2>
        <p className="mt-1 mb-4 text-[14px] text-ink-muted">룰렛으로 혼자 정하거나 새 방을 만들어 보세요.</p>
        <NextSteps primary />
      </section>
    );
  }
  const point = winner.lat !== null && winner.lng !== null ? { lat: winner.lat, lng: winner.lng } : null;
  const origin = config.data;
  return (
    <>
      <section aria-labelledby={RESULT_HEADING_ID} className="overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
        <div className={`bg-panel px-5 pt-5 text-on-panel ${point && origin ? 'pb-12' : 'pb-5'}`}>
          <p className="text-[14px] font-extrabold">{seoulDayLabel(toSeoulDate(new Date(room.deadlineAt)))} 점심은 여기로 정해졌어요</p>
          <h2
            id={RESULT_HEADING_ID}
            tabIndex={-1}
            className="mt-1 text-[36px] leading-[1.08] font-extrabold tracking-[-0.04em] break-keep outline-none"
          >
            {winner.name}
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[14px] font-bold text-on-panel-muted">
            <CategoryBadge category={winner.category} onPanel />
            {room.votes.size}표 중 {winnerVotes}표
          </p>
        </div>
        <div className="flex flex-col gap-4 px-5 pb-5">
          <div className="flex items-start justify-between gap-3">
            <WalkTime minutes={minutes} detail={point && origin ? bearingText(origin.baseName, origin.base, point) : null} />
            {point && origin && (
              <div className="-mt-10 shrink-0 rounded-full bg-surface p-1.5">
                <RadiusRing base={origin.base} baseName={origin.baseName} point={point} radiusM={origin.radiusM} size={116} />
              </div>
            )}
          </div>
          <MealRecord room={room} winner={winner} />
          <p className="-mb-2 text-[13px] leading-relaxed text-ink-muted">가기 전에 지도에서 영업시간을 확인해 주세요.</p>
          <div className="grid grid-cols-2 gap-2">
            <a className={`${mapButton} bg-kakao`} href={kakaoMapUrl(winner)} target="_blank" rel="noreferrer">
              카카오맵
            </a>
            <a className={`${mapButton} bg-naver`} href={naverMapUrl(winner)} target="_blank" rel="noreferrer">
              네이버 지도
            </a>
          </div>
        </div>
      </section>
      <section aria-labelledby="next-steps-title" className="flex flex-col gap-2.5">
        <h2 id="next-steps-title" className="text-[14px] font-bold text-ink-muted">
          여기가 내키지 않으면
        </h2>
        <NextSteps primary={false} />
      </section>
    </>
  );
}

/**
 * Voters get the winner recorded when the room closes, unless they had recorded that day already.
 * Anyone else in the room, or a voter with another record, can put the winner in with one tap.
 */
function MealRecord({ room, winner }: { room: Room; winner: RoomCandidate }) {
  // Always fetched again: the close may have just added this meal, and a list cached before the
  // close (or restored from storage) would not show it.
  const meals = useRecentMeals({ refetchOnMount: 'always' });
  const record = useRecordRoomMeal(room.id);
  const status = useRef<HTMLParagraphElement>(null);
  const date = toSeoulDate(new Date(room.deadlineAt));
  const day = seoulDayLabel(date);
  // Offline the fetch pauses; then the record is unknown rather than loading forever.
  const checking =
    (meals.fetchStatus === 'fetching' && !meals.isFetchedAfterMount) || (meals.isPending && meals.fetchStatus !== 'paused');
  const meal = meals.data?.find((m) => m.eatenOn === date);
  const recorded = !checking && meal?.placeId === winner.placeId;
  const text = recorded
    ? `${day} 내 식사 기록에 남았어요.`
    : !meals.data
      ? '내 식사 기록을 확인하지 못했어요. 여기서 먹었다면 아래 버튼으로 남길 수 있어요.'
      : meal
        ? `${day} 내 기록에는 다른 곳(${meal.name})이 남아 있어요.`
        : `${day} 내 식사 기록에는 아직 없어요.`;

  return (
    <div className="flex flex-col gap-2">
      {/* One status line throughout, so each change is announced; it takes focus from the button
          that disappears once the meal is recorded. */}
      <p
        ref={status}
        role="status"
        tabIndex={-1}
        className={`flex items-center gap-2.5 rounded-[18px] bg-surface-2 px-4 py-3 text-[14px] outline-none ${recorded ? 'font-semibold' : 'text-ink-muted'}`}
      >
        {checking ? (
          <>
            <span className="sr-only">내 식사 기록을 확인하는 중이에요.</span>
            <span aria-hidden="true" className="block h-5 w-48 animate-pulse rounded-full bg-surface" />
          </>
        ) : (
          <>
            {recorded && <CheckIcon size={18} />}
            {text}
          </>
        )}
      </p>
      {!checking && !recorded && (
        <button
          type="button"
          className={`${secondaryButton} w-full`}
          disabled={record.isPending}
          onClick={() => record.mutate(undefined, { onSuccess: () => status.current?.focus() })}
        >
          {record.isPending ? '기록하는 중' : meal ? '여기로 기록 바꾸기' : '나도 여기서 먹었어요'}
        </button>
      )}
      {record.isError && (
        <p role="alert" className="text-[14px] text-accent-ink">
          기록하지 못했어요. {record.error.message}
        </p>
      )}
    </div>
  );
}
