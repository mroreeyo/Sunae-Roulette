import { describe, expect, it } from 'vitest';
import { addDays, businessWindowStart, isBusinessDay, toSeoulDate } from './cooldown.ts';

// 2026-10-12 is a Monday.
describe('isBusinessDay', () => {
  it('treats Monday to Friday as business days', () => {
    expect(isBusinessDay('2026-10-12')).toBe(true);
    expect(isBusinessDay('2026-10-16')).toBe(true);
  });

  it('treats weekends as non-business days', () => {
    expect(isBusinessDay('2026-10-17')).toBe(false);
    expect(isBusinessDay('2026-10-18')).toBe(false);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('rejects malformed or impossible dates', () => {
    expect(() => addDays('2026-2-1', 1)).toThrow(RangeError);
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
  });
});

describe('businessWindowStart', () => {
  it('counts today and skips the weekend', () => {
    // Mon 19, Fri 16, Thu 15, Wed 14, Tue 13
    expect(businessWindowStart('2026-10-19', 5)).toBe('2026-10-13');
  });

  it('returns today for a one-day window on a business day', () => {
    expect(businessWindowStart('2026-10-14', 1)).toBe('2026-10-14');
  });

  it('starts from the last business day when today is a weekend', () => {
    expect(businessWindowStart('2026-10-18', 1)).toBe('2026-10-16');
  });

  it('rejects non-positive windows', () => {
    expect(() => businessWindowStart('2026-10-14', 0)).toThrow(RangeError);
  });
});

describe('toSeoulDate', () => {
  it('uses the Asia/Seoul calendar date (UTC+9)', () => {
    expect(toSeoulDate(new Date('2026-10-14T14:59:59Z'))).toBe('2026-10-14');
    expect(toSeoulDate(new Date('2026-10-14T15:00:00Z'))).toBe('2026-10-15');
  });
});
