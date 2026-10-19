import { toSeoulDate } from '@lunch/core';
import { useEffect, useState } from 'react';

const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "11:40" in Seoul time. */
export function seoulTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** "오늘" for today's Seoul date ("2026-10-19"), otherwise "10월 20일". */
export function seoulDayLabel(date: string, now = new Date()): string {
  if (date === toSeoulDate(now)) return '오늘';
  const [, month, day] = date.split('-');
  return `${Number(month)}월 ${Number(day)}일`;
}

/** "11:40", or "10월 20일 11:40" when the deadline is not today in Seoul. */
export function deadlineLabel(iso: string, now = new Date()): string {
  const date = toSeoulDate(new Date(iso));
  return date === toSeoulDate(now) ? seoulTime(iso) : `${seoulDayLabel(date, now)} ${seoulTime(iso)}`;
}

/** "4분 12초" or "12초" until the deadline. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

/** The current time, updated every second while the component is mounted. */
export function useNow(active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** create-room accepts deadlines up to this far ahead. */
export const MAX_DEADLINE_MS = 12 * 60 * 60 * 1000;

/**
 * The next time the Seoul clock shows `time` ("11:40"): today if that is still ahead, otherwise
 * tomorrow (a room made at 23:55 closes at 00:05). Null when that is more than 12 hours away,
 * which also covers picking a time that has already passed today.
 */
export function deadlineFromTime(time: string, now = new Date()): string | null {
  const today = new Date(`${toSeoulDate(now)}T${time}:00+09:00`);
  if (Number.isNaN(today.getTime())) return null;
  const next = today.getTime() > now.getTime() ? today.getTime() : today.getTime() + 24 * 60 * 60 * 1000;
  return next - now.getTime() <= MAX_DEADLINE_MS ? new Date(next).toISOString() : null;
}
