import { describe, expect, it } from 'vitest';
import { mealStats } from './stats.ts';

const meal = (placeId: string, name: string, category: string, eatenOn: string) => ({ placeId, name, category, eatenOn });

describe('mealStats', () => {
  const today = '2026-10-19';

  it('counts only the last 30 calendar days, today included', () => {
    const stats = mealStats(
      [
        meal('a', '곰탕집', '한식', '2026-10-19'),
        meal('a', '곰탕집', '한식', '2026-09-20'), // 30th day back, inside
        meal('b', '라멘집', '일식', '2026-09-19'), // 31st day back, outside
        meal('c', '미래집', '중식', '2026-10-20'), // future, outside
      ],
      today,
    );
    expect(stats.total).toBe(2);
    expect(stats.categories).toEqual([{ category: '한식', count: 2, ratio: 1 }]);
  });

  it('orders categories and places by count, then by name', () => {
    const stats = mealStats(
      [
        meal('a', '곰탕집', '한식', '2026-10-15'),
        meal('b', '라멘집', '일식', '2026-10-16'),
        meal('b', '라멘집', '일식', '2026-10-17'),
        meal('c', '국수집', '한식', '2026-10-19'),
      ],
      today,
    );
    expect(stats.categories.map((c) => [c.category, c.count])).toEqual([
      ['일식', 2],
      ['한식', 2],
    ]);
    expect(stats.categories[0]!.ratio).toBeCloseTo(0.5);
    expect(stats.topPlaces.map((p) => [p.name, p.count])).toEqual([
      ['라멘집', 2],
      ['곰탕집', 1],
      ['국수집', 1],
    ]);
  });

  it('limits the place ranking and handles no meals', () => {
    const many = Array.from({ length: 7 }, (_, i) => meal(`p${i}`, `식당${i}`, '기타', '2026-10-19'));
    expect(mealStats(many, today).topPlaces).toHaveLength(5);
    expect(mealStats([], today)).toEqual({ total: 0, categories: [], topPlaces: [] });
  });
});
