import { getCountry } from './data/countries';

export type TravelStyle = 'low' | 'comfortable';

export interface TripStop {
  countryId: string;
  days: number;
}

export interface TripPlan {
  stops: TripStop[];
  style: TravelStyle;
  flightsUsd: number;
  insurancePerMonthUsd: number;
  /** YYYY-MM-DD, the day the trip starts. Stops follow each other in order from it. */
  startDate?: string;
  /** The traveller agreed to appear in "מי עוד שם" (needs an account). */
  shareTrip?: boolean;
}

export const emptyPlan: TripPlan = {
  stops: [],
  style: 'low',
  flightsUsd: 1200,
  insurancePerMonthUsd: 100,
};

export interface TripTotals {
  days: number;
  months: number;
  livingUsd: number;
  insuranceUsd: number;
  totalUsd: number;
  perStop: { countryId: string; days: number; costUsd: number }[];
}

export function calcTrip(plan: TripPlan): TripTotals {
  const styleIndex = plan.style === 'low' ? 0 : 1;
  const perStop = plan.stops.map((stop) => {
    const country = getCountry(stop.countryId);
    const daily = country ? country.dailyBudget[styleIndex] : 0;
    const days = Math.max(0, stop.days);
    return { countryId: stop.countryId, days, costUsd: daily * days };
  });

  const days = perStop.reduce((sum, s) => sum + s.days, 0);
  const livingUsd = perStop.reduce((sum, s) => sum + s.costUsd, 0);
  const months = days / 30;
  // Insurance is billed per started month.
  const insuranceUsd = Math.ceil(months) * Math.max(0, plan.insurancePerMonthUsd);
  const flightsUsd = days > 0 ? Math.max(0, plan.flightsUsd) : 0;

  return {
    days,
    months,
    livingUsd,
    insuranceUsd,
    totalUsd: livingUsd + insuranceUsd + flightsUsd,
    perStop,
  };
}

export function formatUsd(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

export function formatDuration(days: number): string {
  if (days < 30) return `${days} ימים`;
  const months = Math.floor(days / 30);
  const rest = days % 30;
  const monthsText = months === 1 ? 'חודש' : months === 2 ? 'חודשיים' : `${months} חודשים`;
  return rest ? `${monthsText} ו־${rest} ימים` : monthsText;
}

export interface StopWindow {
  countryId: string;
  /** YYYY-MM-DD, first day in the country */
  from: string;
  /** YYYY-MM-DD, last day in the country */
  to: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The dates of every stop, back to back from the start date. Empty when no valid start date is set. */
export function stopWindows(plan: TripPlan): StopWindow[] {
  if (!plan.startDate || !DATE_RE.test(plan.startDate) || Number.isNaN(Date.parse(plan.startDate))) return [];
  let cursor = plan.startDate;
  return plan.stops.map((stop) => {
    const days = Math.max(1, Math.round(stop.days));
    const window = { countryId: stop.countryId, from: cursor, to: addDays(cursor, days - 1) };
    cursor = addDays(cursor, days);
    return window;
  });
}

/** "12.3" style short date, as Israelis write it. */
export function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}.${m}`;
}

/** "15.1 עד 13.2": words keep the order right in RTL, where a dash between numbers gets flipped. */
export const formatDateRange = (from: string, to: string) => `${formatShortDate(from)} עד ${formatShortDate(to)}`;
