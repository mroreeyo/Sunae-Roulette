import { distanceMeters, toSeoulDate, walkMinutes } from '@lunch/core';
import { useEffect, useId, useState, type FormEvent } from 'react';
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
import { formatRemaining, seoulTime, useNow } from '../features/room/time.ts';
import { fieldClass } from '../features/ui/field.ts';
import { kakaoMapUrl, naverMapUrl } from '../lib/mapLinks.ts';

const MAX_NICKNAME = 20;

const primaryButton =
  'inline-flex min-h-14 w-full items-center justify-center rounded-full bg-accent px-6 text-[17px] font-bold text-on-accent transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const secondaryButton =
  'inline-flex min-h-12 items-center justify-center rounded-full bg-surface-2 px-5 text-[15px] font-semibold text-ink transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const accentButton =
  'inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
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
        <h1 className="text-[26px] leading-tight font-bold tracking-tight">점심 투표에 초대받았어요</h1>
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

function RoomBody({ room, myId }: { room: Room; myId: string | null }) {
  const config = useAppConfig();
  const vote = useVote(room.id);
  const now = useNow(room.status === 'open');
  const remaining = new Date(room.deadlineAt).getTime() - now;
  const votingOpen = room.status === 'open' && remaining > 0;
  const myVote = myId ? room.votes.get(myId) : undefined;

  const counts = new Map<string, number>();
  for (const candidateId of room.votes.values()) counts.set(candidateId, (counts.get(candidateId) ?? 0) + 1);
  const total = room.votes.size;
  const winner = room.candidates.find((c) => c.placeId === room.winnerPlaceId) ?? null;

  function minutesTo(c: RoomCandidate): number | null {
    if (!config.data || c.lat === null || c.lng === null) return null;
    return walkMinutes(distanceMeters(config.data.base, { lat: c.lat, lng: c.lng }));
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <header className="pt-2">
        <h1 className="text-[26px] leading-tight font-bold tracking-tight">오늘 점심 투표</h1>
        <p className="mt-1 text-[15px] text-ink-muted">
          {room.status === 'closed'
            ? '투표가 끝났어요.'
            : votingOpen
              ? `${seoulTime(room.deadlineAt)} 마감 · ${formatRemaining(remaining)} 남음`
              : '투표를 마감했어요. 결과를 정리하는 중이에요.'}
        </p>
        {/* The countdown above ticks every second, so only the phase changes are announced. */}
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

      {room.status === 'closed' && <Result room={room} winner={winner} minutes={winner ? minutesTo(winner) : null} />}

      {votingOpen && myId === room.hostId && <HostClose room={room} />}

      {votingOpen && <SharePanel code={room.code} />}

      <section aria-labelledby="candidates-title" className="flex flex-col gap-2">
        <h2 id="candidates-title" className="text-[17px] font-bold">
          후보 · {total}표
        </h2>
        <ol className="flex flex-col gap-2" aria-label="후보 목록">
          {room.candidates.map((c) => {
            const count = counts.get(c.id) ?? 0;
            const mine = myVote === c.id;
            const minutes = minutesTo(c);
            return (
              <li key={c.id} className={`rounded-3xl bg-surface px-5 py-4 ring-1 ${mine ? 'ring-accent' : 'ring-line'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold break-keep">{c.name}</p>
                    <p className="mt-0.5 text-[13px] text-ink-muted">
                      {c.category} · {minutes === null ? '위치 정보 없음' : `걸어서 약 ${Math.max(1, Math.round(minutes))}분`}
                    </p>
                  </div>
                  <p className="shrink-0 text-[15px] font-bold tabular-nums" aria-label={`${count}표`}>
                    {count}표
                  </p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500 ease-soft"
                    style={{ width: `${total ? (count / total) * 100 : 0}%` }}
                  />
                </div>
                {votingOpen && (
                  <button
                    type="button"
                    aria-pressed={mine}
                    aria-label={`${c.name} ${mine ? '내가 고른 곳' : '여기 투표'}`}
                    disabled={vote.isPending}
                    onClick={() => vote.mutate(c.id)}
                    className={`mt-3 min-h-11 w-full rounded-full text-[15px] font-semibold ring-1 transition-[transform,background-color] duration-200 ease-soft active:scale-[0.98] disabled:opacity-60 ${
                      mine ? 'bg-accent text-on-accent ring-accent' : 'bg-surface text-ink ring-line'
                    }`}
                  >
                    {mine ? '내가 고른 곳' : '여기 투표'}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        <p role="status" className="text-[14px] text-ink-muted empty:hidden">
          {votingOpen && myVote !== undefined
            ? `투표했어요. ${seoulTime(room.deadlineAt)}에 가장 많은 표를 받은 곳으로 정해져요. 마감 전까지는 다른 곳으로 바꿀 수 있고, 결과는 이 화면과 홈에서 볼 수 있어요.`
            : ''}
        </p>
        {vote.isError && (
          <p role="alert" className="text-[14px] text-accent-ink">
            투표하지 못했어요. {vote.error.message}
          </p>
        )}
      </section>

      <section aria-labelledby="members-title" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="members-title" className="text-[15px] font-bold">
          참여한 사람 {room.members.length}명
        </h2>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="참여한 사람">
          {room.members.map((m) => (
            <li key={m.userId} className="rounded-full bg-surface-2 px-3 py-1 text-[14px]">
              {m.nickname}
              {m.userId === myId && <span className="text-ink-muted"> (나)</span>}
              {room.votes.has(m.userId) && <span className="ml-1 font-semibold text-accent-ink">투표함</span>}
            </li>
          ))}
        </ul>
      </section>

      {room.status === 'open' && (
        <Link to="/" className="text-center text-[14px] text-ink-muted underline underline-offset-4">
          혼자 룰렛 돌리러 가기
        </Link>
      )}
    </div>
  );
}

/** The host can end the vote early, which matters most once everyone has voted. */
function HostClose({ room }: { room: Room }) {
  const close = useCloseRoomNow(room.id);
  const [confirming, setConfirming] = useState(false);
  const waiting = room.members.filter((m) => !room.votes.has(m.userId)).length;
  const allVoted = waiting === 0 && room.votes.size > 0;
  const message = allVoted
    ? '모두 투표했어요. 지금 마감할까요?'
    : room.votes.size === 0
      ? '아직 아무도 투표하지 않았어요. 지금 마감하면 정해지는 곳이 없어요.'
      : `${waiting}명이 아직 투표하지 않았어요.`;

  return (
    <section aria-labelledby="host-close-title" className={`rounded-3xl bg-surface p-5 ring-1 ${allVoted ? 'ring-accent' : 'ring-line'}`}>
      <h2 id="host-close-title" className="text-[15px] font-bold">
        진행자 메뉴
      </h2>
      <p className="mt-1 text-[14px] text-ink-muted">{message}</p>
      {confirming ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-[14px] font-semibold">지금 마감하면 아직 투표하지 않은 사람은 투표할 수 없어요.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={accentButton} disabled={close.isPending} onClick={() => close.mutate()}>
              {close.isPending ? '마감하는 중' : '그래도 마감하기'}
            </button>
            <button type="button" className={secondaryButton} disabled={close.isPending} onClick={() => setConfirming(false)}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`${allVoted ? accentButton : secondaryButton} mt-3 w-full`}
          disabled={close.isPending}
          onClick={() => (allVoted ? close.mutate() : setConfirming(true))}
        >
          {close.isPending ? '마감하는 중' : '지금 마감하기'}
        </button>
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
    <section aria-labelledby="share-title" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
      <h2 id="share-title" className="text-[15px] font-bold">
        팀원 초대하기
      </h2>
      <p className="mt-1 break-all text-[14px] text-ink-muted select-all">{url}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="min-h-11 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent transition-transform duration-200 ease-soft active:scale-[0.98]"
        >
          링크 복사
        </button>
        {canShare && (
          <button
            type="button"
            onClick={() => void navigator.share({ title: '오늘 점심 투표', url }).catch(() => undefined)}
            className="min-h-11 rounded-full bg-surface-2 px-4 text-[14px] font-semibold text-ink transition-transform duration-200 ease-soft active:scale-[0.98]"
          >
            공유하기
          </button>
        )}
      </div>
      <p role="status" className="text-[13px] text-ink-muted not-empty:mt-2">
        {status}
      </p>
    </section>
  );
}

/** What to do when the result is not the plan: decide alone, or vote again with new candidates. */
function NextSteps({ primary }: { primary: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Link to="/" className={primary ? accentButton : secondaryButton}>
        룰렛으로 정하기
      </Link>
      <Link to="/rooms/new" className={secondaryButton}>
        새 투표 방 만들기
      </Link>
    </div>
  );
}

function Result({ room, winner, minutes }: { room: Room; winner: RoomCandidate | null; minutes: number | null }) {
  if (!winner) {
    return (
      <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <p className="text-[17px] font-bold">아무도 투표하지 않아 정해지지 않았어요.</p>
        <p className="mt-1 mb-4 text-[14px] text-ink-muted">룰렛으로 혼자 정하거나 새 방을 만들어 보세요.</p>
        <NextSteps primary />
      </section>
    );
  }
  return (
    <section aria-labelledby="winner-name" className="rounded-[28px] bg-ink/[0.03] p-1.5 ring-1 ring-line">
      <div className="rounded-[22px] bg-surface p-5">
        <p className="text-[14px] font-semibold text-accent-ink">오늘 점심은 여기로 정해졌어요</p>
        <h2 id="winner-name" className="mt-2 text-2xl leading-tight font-bold tracking-tight break-keep">
          {winner.name}
        </h2>
        <p className="mt-1 text-[15px] text-ink-muted">
          {winner.category} · {minutes === null ? '도보 시간 알 수 없음' : `걸어서 약 ${Math.max(1, Math.round(minutes))}분`}
        </p>
        <MealRecord room={room} winner={winner} />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a className={`${mapButton} bg-kakao`} href={kakaoMapUrl(winner)} target="_blank" rel="noreferrer">
            카카오맵
          </a>
          <a className={`${mapButton} bg-naver`} href={naverMapUrl(winner)} target="_blank" rel="noreferrer">
            네이버 지도
          </a>
        </div>
        <p className="mt-5 mb-2 text-[13px] text-ink-muted">여기가 내키지 않으면</p>
        <NextSteps primary={false} />
      </div>
    </section>
  );
}

function dayLabel(date: string): string {
  if (date === toSeoulDate(new Date())) return '오늘';
  const [, month, day] = date.split('-');
  return `${Number(month)}월 ${Number(day)}일`;
}

/**
 * Voters get the winner recorded when the room closes, unless they had recorded that day already.
 * Anyone else in the room, or a voter with another record, can put the winner in with one tap.
 */
function MealRecord({ room, winner }: { room: Room; winner: RoomCandidate }) {
  const meals = useRecentMeals();
  const record = useRecordRoomMeal(room.id);
  const date = toSeoulDate(new Date(room.deadlineAt));
  const day = dayLabel(date);
  if (!meals.data) return <p className="mt-3 h-5 w-48 animate-pulse rounded-full bg-surface-2" aria-label="식사 기록 불러오는 중" />;

  const meal = meals.data.find((m) => m.eatenOn === date);
  if (meal?.placeId === winner.placeId) {
    return (
      <p role="status" className="mt-3 text-[14px] text-ink-muted">
        {day} 내 식사 기록에 남았어요.
      </p>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-[14px] text-ink-muted">
        {meal ? `${day} 내 기록에는 다른 곳(${meal.name})이 남아 있어요.` : `${day} 내 식사 기록에는 아직 없어요.`}
      </p>
      <button type="button" className={`${secondaryButton} w-full`} disabled={record.isPending} onClick={() => record.mutate()}>
        {record.isPending ? '기록하는 중' : meal ? '여기로 기록 바꾸기' : '나도 여기서 먹었어요'}
      </button>
      {record.isError && (
        <p role="alert" className="text-[14px] text-accent-ink">
          기록하지 못했어요. {record.error.message}
        </p>
      )}
    </div>
  );
}
