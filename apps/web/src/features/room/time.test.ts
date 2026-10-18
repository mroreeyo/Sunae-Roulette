import { describe, expect, it } from 'vitest';
import { deadlineFromTime, formatRemaining } from './time.ts';

describe('deadlineFromTime', () => {
  it('uses today when the time is still ahead', () => {
    // 10:05 in Seoul.
    expect(deadlineFromTime('11:40', new Date('2026-10-19T01:05:00Z'))).toBe('2026-10-19T02:40:00.000Z');
  });

  it('rolls over to tomorrow just before midnight', () => {
    // 23:55 in Seoul; 00:05 is ten minutes away.
    expect(deadlineFromTime('00:05', new Date('2026-10-19T14:55:00Z'))).toBe('2026-10-19T15:05:00.000Z');
  });

  it('refuses a time that has passed today and is over 12 hours away tomorrow', () => {
    // 13:00 in Seoul; 11:40 tomorrow is almost 23 hours away.
    expect(deadlineFromTime('11:40', new Date('2026-10-19T04:00:00Z'))).toBeNull();
  });

  it('refuses a time more than 12 hours ahead today', () => {
    // 08:00 in Seoul; 21:00 is 13 hours away.
    expect(deadlineFromTime('21:00', new Date('2026-10-18T23:00:00Z'))).toBeNull();
  });

  it('refuses an empty or broken time', () => {
    expect(deadlineFromTime('', new Date('2026-10-19T01:05:00Z'))).toBeNull();
  });
});

describe('formatRemaining', () => {
  it('shows minutes and seconds, then seconds alone', () => {
    expect(formatRemaining(252_000)).toBe('4분 12초');
    expect(formatRemaining(12_000)).toBe('12초');
    expect(formatRemaining(-5_000)).toBe('0초');
  });
});
