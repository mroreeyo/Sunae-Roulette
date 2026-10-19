import { toSeoulDate } from '@lunch/core';
import { Link } from 'react-router';
import { useTodaysRooms, useTodaysRoomsSync, type TodaysRoom } from './api.ts';
import { deadlineLabel, seoulDayLabel, useNow } from './time.ts';

const roomLink =
  'inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-surface-2 px-4 text-[14px] font-bold text-ink transition-transform duration-200 ease-soft active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** Today's team votes I joined, so the vote and its result can be found again after leaving the room. */
export function TodaysRooms() {
  const rooms = useTodaysRooms();
  useTodaysRoomsSync(rooms.data);
  const now = useNow(rooms.data?.some((r) => r.status === 'open') ?? false);
  if (!rooms.data || rooms.data.length === 0) return null;

  return (
    <section aria-label="오늘의 팀 투표" className="flex flex-col gap-2">
      {rooms.data.map((room) => (
        <RoomRow key={room.id} room={room} now={now} />
      ))}
    </section>
  );
}

function RoomRow({ room, now }: { room: TodaysRoom; now: number }) {
  const votingOpen = room.status === 'open' && new Date(room.deadlineAt).getTime() > now;
  // A room made the evening before is for the next day's lunch, so its day is spelled out.
  const day = seoulDayLabel(toSeoulDate(new Date(room.deadlineAt)));
  const { title, detail, action } =
    room.status === 'closed'
      ? room.winner
        ? { title: `${day} 투표 결과: ${room.winner.name}`, detail: room.winner.category, action: '결과 보기' }
        : { title: '투표로 정해진 곳이 없어요', detail: '아무도 투표하지 않았어요', action: '방 보기' }
      : votingOpen
        ? {
            title: '팀 투표 진행 중',
            detail: `${deadlineLabel(room.deadlineAt)} 마감 · ${room.voted ? '투표했어요' : '아직 투표하지 않았어요'}`,
            action: room.voted ? '방 보기' : '투표하러 가기',
          }
        : { title: '팀 투표 마감', detail: '결과를 정리하는 중이에요', action: '방 보기' };

  return (
    <div className="flex items-center justify-between gap-3 rounded-3xl bg-surface px-5 py-4 ring-1 ring-line">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold break-keep">{title}</p>
        <p className="mt-0.5 text-[13px] text-ink-muted">{detail}</p>
      </div>
      <Link to={`/r/${room.code}`} className={roomLink} aria-label={`${title} ${action}`}>
        {action}
      </Link>
    </div>
  );
}
