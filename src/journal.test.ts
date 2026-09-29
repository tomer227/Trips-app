import { describe, expect, it } from 'vitest';
import { formatDate, sortByDateDesc, summarizeExpenses, type Expense } from './journal';
import { emptyPlan } from './budget';

const exp = (date: string, countryId: string, amountUsd: number, category: Expense['category'] = 'food'): Expense => ({
  id: `${date}-${amountUsd}`,
  date,
  countryId,
  category,
  amount: amountUsd,
  currency: 'USD',
  amountUsd,
  note: '',
});

describe('summarizeExpenses', () => {
  it('handles no expenses', () => {
    expect(summarizeExpenses([], emptyPlan)).toMatchObject({ totalUsd: 0, days: 0, perDayUsd: 0 });
  });

  it('sums by day, category and country with planned budget', () => {
    const s = summarizeExpenses(
      [exp('2026-01-01', 'thailand', 20), exp('2026-01-01', 'thailand', 10, 'sleep'), exp('2026-01-02', 'laos', 30)],
      emptyPlan,
    );
    expect(s.totalUsd).toBe(60);
    expect(s.days).toBe(2);
    expect(s.perDayUsd).toBe(30);
    expect(s.byCategory).toEqual([
      { category: 'food', usd: 50 },
      { category: 'sleep', usd: 10 },
    ]);
    expect(s.byCountry[0]).toEqual({ countryId: 'thailand', usd: 30, days: 1, plannedPerDayUsd: 35 });
  });
});

describe('journal helpers', () => {
  it('sorts newest first, latest-added first within a day', () => {
    const items = [
      { id: 'a', date: '2026-01-01' },
      { id: 'b', date: '2026-01-03' },
      { id: 'c', date: '2026-01-01' },
    ];
    expect(sortByDateDesc(items).map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('formats dates the Israeli way', () => {
    expect(formatDate('2026-03-07')).toBe('7.3.2026');
  });
});
