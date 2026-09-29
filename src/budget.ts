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
