import { countries } from './data/countries';
import { calcTrip, type TripPlan } from './budget';
import type { Expense } from './journal';
import { myShareUsd } from './split';

/** "How long will the money last?" – what the traveller has, versus what they actually spend. */
export interface MoneySettings {
  /** Money for life on the road (not counting flights already paid) */
  amount: number;
  currency: 'ILS' | 'USD';
  /** First day of the trip; defaults to the first logged expense */
  startDate: string;
}

export const emptyMoney: MoneySettings = { amount: 0, currency: 'ILS', startDate: '' };

/** How many recent spending days the burn rate looks at. */
export const RECENT_DAYS = 14;
/** Below this many logged days, the plan's budget is a better guess than real spending. */
export const MIN_ACTUAL_DAYS = 3;

export type BurnSource = 'actual' | 'plan' | 'none';

export interface Runway {
  budgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  burnPerDayUsd: number;
  burnSource: BurnSource;
  /** Days of spending days that the remaining money covers at the current burn rate */
  runwayDays: number | null;
  /** The last day the money covers */
  outDate: string | null;
  /** Days left in the plan, counting from today */
  plannedDaysLeft: number | null;
  /** runwayDays - plannedDaysLeft: positive = money left over, negative = short */
  diffDays: number | null;
  /** Burn rate the plan needs so the money lasts exactly to the end */
  neededPerDayUsd: number | null;
  /** How many days the remaining money buys in each country, at the plan's travel style */
  perCountry: { countryId: string; days: number }[];
}

export function daysBetween(fromIso: string, toIso: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / 86400000);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Average spend per logged day over the most recent days, so an expensive first week doesn't skew it forever. */
export function recentBurn(expenses: Expense[], recentDays = RECENT_DAYS): { perDay: number; days: number } {
  const byDay = new Map<string, number>();
  for (const e of expenses) byDay.set(e.date, (byDay.get(e.date) ?? 0) + myShareUsd(e));
  const recent = [...byDay.keys()].sort().slice(-recentDays);
  if (recent.length === 0) return { perDay: 0, days: 0 };
  const total = recent.reduce((s, d) => s + (byDay.get(d) ?? 0), 0);
  return { perDay: total / recent.length, days: byDay.size };
}

export function calcRunway(input: { budgetUsd: number; expenses: Expense[]; plan: TripPlan; today: string; startDate?: string }): Runway {
  const { budgetUsd, expenses, plan, today } = input;
  // Shared expenses count only the traveller's part (partners settle the rest).
  const spentUsd = expenses.reduce((s, e) => s + myShareUsd(e), 0);
  const remainingUsd = Math.max(0, budgetUsd - spentUsd);
  const totals = calcTrip(plan);

  const actual = recentBurn(expenses);
  let burnPerDayUsd = 0;
  let burnSource: BurnSource = 'none';
  if (actual.days >= MIN_ACTUAL_DAYS && actual.perDay > 0) {
    burnPerDayUsd = actual.perDay;
    burnSource = 'actual';
  } else if (totals.days > 0 && totals.livingUsd > 0) {
    burnPerDayUsd = totals.livingUsd / totals.days;
    burnSource = 'plan';
  }

  const runwayDays = burnPerDayUsd > 0 && budgetUsd > 0 ? Math.floor(remainingUsd / burnPerDayUsd) : null;
  // The money covers today too, so the last covered day is today + runway - 1.
  const outDate = runwayDays !== null && runwayDays > 0 ? addDays(today, runwayDays - 1) : runwayDays === 0 ? today : null;

  const firstExpense = expenses.reduce<string | null>((min, e) => (min === null || e.date < min ? e.date : min), null);
  const start = input.startDate || firstExpense;
  let plannedDaysLeft: number | null = null;
  if (totals.days > 0) {
    const elapsed = start && start <= today ? daysBetween(start, today) : 0;
    plannedDaysLeft = Math.max(0, totals.days - elapsed);
  }

  const styleIndex = plan.style === 'low' ? 0 : 1;
  const perCountry = countries
    .map((c) => ({ countryId: c.id, days: Math.floor(remainingUsd / c.dailyBudget[styleIndex]) }))
    .sort((a, b) => b.days - a.days);

  return {
    budgetUsd,
    spentUsd,
    remainingUsd,
    burnPerDayUsd,
    burnSource,
    runwayDays,
    outDate,
    plannedDaysLeft,
    diffDays: runwayDays !== null && plannedDaysLeft !== null ? runwayDays - plannedDaysLeft : null,
    neededPerDayUsd: plannedDaysLeft ? remainingUsd / plannedDaysLeft : null,
    perCountry,
  };
}
