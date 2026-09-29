import { describe, expect, it } from 'vitest';
import { convert, fallbackRates, formatMoney, parseApiResponse } from './currency';

describe('currency', () => {
  const rates = { USD: 1, ILS: 4, THB: 32 };

  it('converts through USD', () => {
    expect(convert(32, 'THB', 'USD', rates)).toBe(1);
    expect(convert(100, 'THB', 'ILS', rates)).toBeCloseTo(12.5);
    expect(convert(10, 'USD', 'XXX', rates)).toBeNull();
  });

  it('formats with precision that fits the size', () => {
    expect(formatMoney(1234.567, 'ILS')).toBe('₪1,235');
    expect(formatMoney(12.345, 'USD')).toBe('$12.35');
    expect(formatMoney(5, 'ZZZ')).toBe('5 ZZZ');
  });

  it('parses the API response and keeps fallback codes', () => {
    const parsed = parseApiResponse({ result: 'success', time_last_update_unix: 1000, rates: { USD: 1, ILS: 3.7 } });
    expect(parsed?.updatedAt).toBe(1_000_000);
    expect(parsed?.rates.ILS).toBe(3.7);
    expect(parsed?.rates.THB).toBe(fallbackRates.THB);
    expect(parseApiResponse({ result: 'error' })).toBeNull();
  });
});
