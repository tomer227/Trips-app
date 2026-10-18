import { describe, expect, it } from 'vitest';
import { calcRunway, daysBetween, recentBurn } from './runway';
import { emptyPlan, type TripPlan } from './budget';
import type { Expense } from './journal';

const exp = (date: string, amountUsd: number, countryId = 'vietnam'): Expense => ({
  id: `${date}-${amountUsd}`,
  date,
  countryId,
  category: 'food',
  amount: amountUsd,
  currency: 'USD',
  amountUsd,
  note: '',
});

// Vietnam is [25, 40] a day, Thailand [35, 55]
const plan: TripPlan = { ...emptyPlan, stops: [{ countryId: 'vietnam', days: 30 }, { countryId: 'thailand', days: 30 }] };

describe('recentBurn', () => {
  it('averages only the most recent logged days', () => {
    const expenses = [exp('2026-01-01', 200), exp('2026-01-02', 20), exp('2026-01-03', 20), exp('2026-01-03', 10)];
    expect(recentBurn(expenses, 2)).toEqual({ perDay: 25, days: 3 });
    expect(recentBurn([])).toEqual({ perDay: 0, days: 0 });
  });
});

describe('calcRunway', () => {
  it('uses the plan budget before there are enough real expenses', () => {
    const r = calcRunway({ budgetUsd: 1800, expenses: [], plan, today: '2026-01-01' });
    expect(r.burnSource).toBe('plan');
    expect(r.burnPerDayUsd).toBe(30); // (25*30 + 35*30) / 60
    expect(r.runwayDays).toBe(60);
    expect(r.outDate).toBe('2026-03-01');
    expect(r.plannedDaysLeft).toBe(60);
    expect(r.diffDays).toBe(0);
  });

  it('switches to real spending and shows the shortfall', () => {
    const expenses = [exp('2026-01-01', 40), exp('2026-01-02', 40), exp('2026-01-03', 40)];
    const r = calcRunway({ budgetUsd: 1800, expenses, plan, today: '2026-01-04', startDate: '2026-01-01' });
    expect(r.burnSource).toBe('actual');
    expect(r.spentUsd).toBe(120);
    expect(r.remainingUsd).toBe(1680);
    expect(r.runwayDays).toBe(42);
    expect(r.plannedDaysLeft).toBe(57);
    expect(r.diffDays).toBe(-15);
    expect(r.neededPerDayUsd).toBeCloseTo(1680 / 57);
  });

  it('counts elapsed days from the first expense when no start date is set', () => {
    const expenses = [exp('2026-01-01', 30), exp('2026-01-02', 30), exp('2026-01-03', 30)];
    const r = calcRunway({ budgetUsd: 1800, expenses, plan, today: '2026-01-11' });
    expect(r.plannedDaysLeft).toBe(50);
  });

  it('shows how far the money goes in each country, cheapest first', () => {
    const r = calcRunway({ budgetUsd: 1000, expenses: [], plan: emptyPlan, today: '2026-01-01' });
    expect(r.burnSource).toBe('none');
    expect(r.runwayDays).toBeNull();
    expect(r.plannedDaysLeft).toBeNull();
    const days = r.perCountry.map((c) => c.days);
    expect([...days].sort((a, b) => b - a)).toEqual(days);
    expect(r.perCountry.find((c) => c.countryId === 'vietnam')?.days).toBe(40);
  });

  it('never goes below zero when overspent', () => {
    const r = calcRunway({ budgetUsd: 50, expenses: [exp('2026-01-01', 30), exp('2026-01-02', 30), exp('2026-01-03', 30)], plan, today: '2026-01-04' });
    expect(r.remainingUsd).toBe(0);
    expect(r.runwayDays).toBe(0);
    expect(r.outDate).toBe('2026-01-04');
  });
});

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-02-27', '2026-03-02')).toBe(3);
  });
});
