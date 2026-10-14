import type { IsoDate } from './types.ts';

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcMs(date: IsoDate): number {
  const match = ISO_DATE.exec(date);
  if (!match) throw new RangeError(`Invalid date: ${date}`);
  const [, y, m, d] = match;
  const ms = Date.UTC(Number(y), Number(m) - 1, Number(d));
  if (new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Invalid date: ${date}`);
  }
  return ms;
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/** Business days are Monday to Friday. Public holidays are out of scope for v1. */
export function isBusinessDay(date: IsoDate): boolean {
  const weekday = new Date(toUtcMs(date)).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

/**
 * First day of the "last N business days" window that ends today.
 * Today counts when it is a business day, so a meal on or after the
 * returned date falls inside the window.
 */
export function businessWindowStart(today: IsoDate, businessDays: number): IsoDate {
  if (!Number.isInteger(businessDays) || businessDays < 1) {
    throw new RangeError(`businessDays must be a positive integer: ${businessDays}`);
  }
  let cursor = today;
  let counted = 0;
  for (;;) {
    if (isBusinessDay(cursor)) {
      counted += 1;
      if (counted === businessDays) return cursor;
    }
    cursor = addDays(cursor, -1);
  }
}

export function toSeoulDate(instant: Date): IsoDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
