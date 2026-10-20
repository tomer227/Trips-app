import { describe, expect, it } from 'vitest';
import { countries } from './data/countries';
import { SEASONS, checkSeason, goodMonths } from './seasons';

describe('seasons', () => {
  it('covers every country with 12 months', () => {
    for (const c of countries) {
      expect(SEASONS[c.id], c.id).toBeDefined();
      expect(SEASONS[c.id].months).toMatch(/^[gob]{12}$/);
    }
  });

  it('flags the weakest month a stop runs into', () => {
    expect(checkSeason('thailand', '2027-01-05', '2027-02-20')).toEqual({ rating: 'g', months: ['ינואר', 'פברואר'], note: undefined });
    const rainy = checkSeason('thailand', '2027-04-20', '2027-06-10')!;
    expect(rainy.rating).toBe('b');
    expect(rainy.months).toEqual(['מאי', 'יוני']);
    expect(rainy.note).toBe('עונת גשמים');
    expect(checkSeason('peru', '2027-12-20', '2028-01-10')!.rating).toBe('b'); // crosses the new year
  });

  it('ignores unknown countries and lists good months', () => {
    expect(checkSeason('atlantis', '2027-01-01', '2027-01-02')).toBeUndefined();
    expect(goodMonths('philippines')).toEqual(['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'דצמבר']);
  });
});
