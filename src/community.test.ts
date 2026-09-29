import { describe, expect, it } from 'vitest';
import { hotNow, reviewStats, type Review } from './community';
import { countries } from './data/countries';
import { monthRange, places } from './data/places';

const review = (stars: number, tags: Review['tags'], costUsd?: number): Review => ({
  id: String(Math.random()),
  placeId: 'x',
  stars,
  text: '',
  visited: '2026-01',
  tags,
  costUsd,
  createdAt: 0,
});

describe('reviewStats', () => {
  it('handles no reviews', () => {
    expect(reviewStats([])).toEqual({ count: 0, average: null, tagCounts: [], averageCostUsd: null });
  });

  it('averages stars and cost, and counts tags', () => {
    const s = reviewStats([review(5, ['safe-alone', 'cheap'], 10), review(3, ['safe-alone']), review(4, [], 20)]);
    expect(s.count).toBe(3);
    expect(s.average).toBe(4);
    expect(s.averageCostUsd).toBe(15);
    expect(s.tagCounts[0]).toEqual({ tag: 'safe-alone', count: 2 });
  });
});

describe('hotNow', () => {
  it('finds this month’s festivals and next month’s separately', () => {
    const june = hotNow(places, 6);
    expect(june.festivalsNow.map((p) => p.id)).toContain('inti-raymi');
    const may = hotNow(places, 5);
    expect(may.festivalsNext.map((p) => p.id)).toContain('inti-raymi');
    expect(may.festivalsNow.map((p) => p.id)).not.toContain('inti-raymi');
  });

  it('wraps December to January and filters by region', () => {
    const dec = hotNow(places, 12, 'asia');
    expect(dec.festivalsNext.every((p) => p.months?.includes(1))).toBe(true);
    expect(dec.hotspots.map((p) => p.id)).toContain('arambol');
    expect(dec.hotspots.map((p) => p.id)).not.toContain('bariloche');
  });

  it('lists busiest hotspots first', () => {
    const { hotspots } = hotNow(places, 1);
    expect(hotspots[0].israeli).toBe('high');
  });
});

describe('places data', () => {
  it('references real countries and valid coordinates', () => {
    const ids = new Set(countries.map((c) => c.id));
    for (const p of places) {
      expect(ids.has(p.countryId), p.id).toBe(true);
      expect(Math.abs(p.lat) <= 60 && Math.abs(p.lng) <= 180, p.id).toBe(true);
      p.months?.forEach((m) => expect(m >= 1 && m <= 12, p.id).toBe(true));
    }
    expect(new Set(places.map((p) => p.id)).size).toBe(places.length);
  });
});

describe('monthRange', () => {
  it('describes runs of months, including across new year', () => {
    expect(monthRange([11, 12, 1, 2, 3])).toBe('נובמבר–מרץ');
    expect(monthRange([4, 5, 6, 9, 10])).toBe('אפריל–יוני, ספטמבר–אוקטובר');
    expect(monthRange([6])).toBe('יוני');
    expect(monthRange([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('כל השנה');
  });
});
