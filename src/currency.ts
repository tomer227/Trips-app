import { useCallback, useEffect, useState } from 'react';

/** Rates are expressed as units of currency per 1 USD. */
export type Rates = Record<string, number>;

export interface RatesState {
  rates: Rates;
  /** Unix ms of when the rates were published / fetched */
  updatedAt: number | null;
  source: 'live' | 'cached' | 'fallback';
}

export const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_KEY = 'fx-rates';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Approximate rates bundled with the app so the converter works on first launch offline.
 * They are replaced by live rates whenever the device is online.
 */
export const fallbackRates: Rates = {
  USD: 1,
  ILS: 3.3,
  EUR: 0.86,
  THB: 32.5,
  VND: 26300,
  LAK: 21700,
  KHR: 4020,
  INR: 88,
  NPR: 141,
  LKR: 302,
  PHP: 58,
  JPY: 150,
  IDR: 16500,
  PEN: 3.45,
  BOB: 6.91,
  CLP: 950,
  ARS: 1450,
  BRL: 5.4,
  COP: 3900,
  MXN: 18.5,
  GTQ: 7.7,
  CRC: 505,
};

export const currencyNames: Record<string, { name: string; symbol: string; flag: string }> = {
  ILS: { name: 'שקל', symbol: '₪', flag: '🇮🇱' },
  USD: { name: 'דולר אמריקאי', symbol: '$', flag: '🇺🇸' },
  EUR: { name: 'אירו', symbol: '€', flag: '🇪🇺' },
  THB: { name: 'באט תאילנדי', symbol: '฿', flag: '🇹🇭' },
  VND: { name: 'דונג וייטנאמי', symbol: '₫', flag: '🇻🇳' },
  LAK: { name: 'קיפ לאי', symbol: '₭', flag: '🇱🇦' },
  KHR: { name: 'ריאל קמבודי', symbol: '៛', flag: '🇰🇭' },
  INR: { name: 'רופי הודי', symbol: '₹', flag: '🇮🇳' },
  NPR: { name: 'רופי נפאלי', symbol: 'रू', flag: '🇳🇵' },
  LKR: { name: 'רופי סרי לנקי', symbol: 'Rs', flag: '🇱🇰' },
  PHP: { name: 'פסו פיליפיני', symbol: '₱', flag: '🇵🇭' },
  JPY: { name: 'ין יפני', symbol: '¥', flag: '🇯🇵' },
  IDR: { name: 'רופיה אינדונזית', symbol: 'Rp', flag: '🇮🇩' },
  PEN: { name: 'סול פרואני', symbol: 'S/', flag: '🇵🇪' },
  BOB: { name: 'בוליביאנו', symbol: 'Bs', flag: '🇧🇴' },
  CLP: { name: 'פסו צ׳יליאני', symbol: '$', flag: '🇨🇱' },
  ARS: { name: 'פסו ארגנטינאי', symbol: '$', flag: '🇦🇷' },
  BRL: { name: 'ריאל ברזילאי', symbol: 'R$', flag: '🇧🇷' },
  COP: { name: 'פסו קולומביאני', symbol: '$', flag: '🇨🇴' },
  MXN: { name: 'פסו מקסיקני', symbol: '$', flag: '🇲🇽' },
  GTQ: { name: 'קצאל גואטמלי', symbol: 'Q', flag: '🇬🇹' },
  CRC: { name: 'קולון קוסטה ריקני', symbol: '₡', flag: '🇨🇷' },
};

export const currencyCodes = Object.keys(currencyNames);

/** Convert between two currencies using USD-based rates. Returns null if a rate is missing. */
export function convert(amount: number, from: string, to: string, rates: Rates): number | null {
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return null;
  return (amount / fromRate) * toRate;
}

/** Format with sensible precision: small values keep decimals, big ones are rounded. */
export function formatMoney(value: number, code: string): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : 4;
  const num = value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  const symbol = currencyNames[code]?.symbol;
  return symbol ? `${symbol}${num}` : `${num} ${code}`;
}

interface ApiResponse {
  result: string;
  time_last_update_unix?: number;
  rates?: Rates;
}

export function parseApiResponse(data: ApiResponse): { rates: Rates; updatedAt: number } | null {
  if (data.result !== 'success' || !data.rates || typeof data.rates.USD !== 'number') return null;
  return {
    rates: { ...fallbackRates, ...data.rates },
    updatedAt: data.time_last_update_unix ? data.time_last_update_unix * 1000 : Date.now(),
  };
}

function readCache(): { rates: Rates; updatedAt: number; fetchedAt: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function initialState(): RatesState {
  const cached = readCache();
  if (!cached) return { rates: fallbackRates, updatedAt: null, source: 'fallback' };
  // A recently fetched cache is as good as live data.
  const fresh = Date.now() - cached.fetchedAt <= MAX_AGE_MS;
  return { rates: { ...fallbackRates, ...cached.rates }, updatedAt: cached.updatedAt, source: fresh ? 'live' : 'cached' };
}

export function useRates() {
  const [state, setState] = useState<RatesState>(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(RATES_URL);
      const parsed = res.ok ? parseApiResponse(await res.json()) : null;
      if (!parsed) throw new Error('Bad rates response');
      setState({ ...parsed, source: 'live' });
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ...parsed, fetchedAt: Date.now() }));
      } catch {
        // Storage unavailable – live rates still work for this session.
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = readCache();
    if (!cached || Date.now() - cached.fetchedAt > MAX_AGE_MS) void refresh();
  }, [refresh]);

  return { ...state, loading, error, refresh };
}
