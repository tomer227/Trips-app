import { describe, expect, it } from 'vitest';
import { calcTrip, emptyPlan, formatDuration } from './budget';
import { parseRoute } from './router';

describe('calcTrip', () => {
  it('returns zeros for an empty plan (no flights charged)', () => {
    const totals = calcTrip(emptyPlan);
    expect(totals).toMatchObject({ days: 0, livingUsd: 0, insuranceUsd: 0, totalUsd: 0 });
  });

  it('sums living costs by travel style, insurance per started month and flights', () => {
    const plan = {
      ...emptyPlan,
      stops: [
        { countryId: 'thailand', days: 30 }, // 35/day low
        { countryId: 'laos', days: 10 }, // 25/day low
      ],
      flightsUsd: 1000,
      insurancePerMonthUsd: 100,
    };
    const totals = calcTrip(plan);
    expect(totals.days).toBe(40);
    expect(totals.livingUsd).toBe(30 * 35 + 10 * 25);
    expect(totals.insuranceUsd).toBe(200);
    expect(totals.totalUsd).toBe(1300 + 200 + 1000);

    const comfy = calcTrip({ ...plan, style: 'comfortable' });
    expect(comfy.livingUsd).toBe(30 * 55 + 10 * 35);
  });

  it('ignores unknown countries and negative days', () => {
    const totals = calcTrip({ ...emptyPlan, stops: [{ countryId: 'nowhere', days: 5 }, { countryId: 'peru', days: -3 }] });
    expect(totals.livingUsd).toBe(0);
    expect(totals.days).toBe(5);
  });
});

describe('formatDuration', () => {
  it('formats days and months in Hebrew', () => {
    expect(formatDuration(12)).toBe('12 ימים');
    expect(formatDuration(30)).toBe('חודש');
    expect(formatDuration(65)).toBe('חודשיים ו־5 ימים');
    expect(formatDuration(120)).toBe('4 חודשים');
  });
});

describe('parseRoute', () => {
  it('parses known routes and falls back to home', () => {
    expect(parseRoute('#/country/peru')).toEqual({ name: 'country', id: 'peru' });
    expect(parseRoute('#/plan')).toEqual({ name: 'plan' });
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/nonsense')).toEqual({ name: 'home' });
    expect(parseRoute('#/country')).toEqual({ name: 'home' });
    expect(parseRoute('#/currency/thb')).toEqual({ name: 'currency', code: 'THB' });
    expect(parseRoute('#/journal')).toEqual({ name: 'journal' });
    expect(parseRoute('#/map/kasol')).toEqual({ name: 'map', id: 'kasol' });
    expect(parseRoute('#/hot')).toEqual({ name: 'hot' });
  });
});
