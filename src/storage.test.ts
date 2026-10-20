import { describe, expect, it } from 'vitest';
import { sanitizeStored } from './storage';

describe('sanitizeStored', () => {
  const plan = { stops: [] as string[], budget: 'mid', extra: { a: 1 } };

  it('keeps good data and adds fields that are new since it was saved', () => {
    expect(sanitizeStored({ stops: ['peru'], budget: 'low' }, plan)).toEqual({ stops: ['peru'], budget: 'low', extra: { a: 1 } });
  });

  it('falls back to the default when the stored value has the wrong shape', () => {
    for (const bad of [null, 'x', 42, []]) expect(sanitizeStored(bad, plan)).toBe(plan);
    expect(sanitizeStored({ stops: 'x', extra: null }, plan)).toEqual(plan);
    expect(sanitizeStored({}, [])).toEqual([]);
    expect(sanitizeStored(['a'], [])).toEqual(['a']);
    expect(sanitizeStored(5, 'east')).toBe('east');
    expect(sanitizeStored('x', null)).toBe(null);
    expect(sanitizeStored({ lat: 1 }, null)).toEqual({ lat: 1 });
  });
});
