import { describe, expect, it } from 'vitest';
import { cleanTripWindows, CloudError, cloudErrorMessages, cloudErrorText, localToday, MAX_TRIP_DAYS, MAX_TRIP_WINDOWS } from './types';

const TODAY = '2026-10-20';
const plus = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe('cleanTripWindows', () => {
  it('drops ended or broken stops and starts current ones from today', () => {
    expect(
      cleanTripWindows(
        [
          { countryId: 'peru', from: plus(-30), to: plus(-1) },
          { countryId: 'chile', from: plus(-5), to: plus(5) },
          { countryId: 'Bad!', from: plus(1), to: plus(2) },
          { countryId: 'bolivia', from: plus(9), to: plus(8) },
          { countryId: 'bolivia', from: plus(6), to: plus(9) },
        ],
        TODAY,
      ),
    ).toEqual([
      { countryId: 'chile', from: TODAY, to: plus(5) },
      { countryId: 'bolivia', from: plus(6), to: plus(9) },
    ]);
  });

  it('cuts a long trip at the end so it fits the database limits', () => {
    const long = cleanTripWindows([{ countryId: 'india', from: TODAY, to: plus(300) }, { countryId: 'nepal', from: plus(301), to: plus(600) }], TODAY);
    expect(long.reduce((sum, w) => sum + (Date.parse(w.to) - Date.parse(w.from)) / 86_400_000 + 1, 0)).toBe(MAX_TRIP_DAYS);
    expect(long[1]).toEqual({ countryId: 'nepal', from: plus(301), to: plus(MAX_TRIP_DAYS - 1) });

    const many = Array.from({ length: 20 }, (_, i) => ({ countryId: 'thailand', from: plus(i * 2), to: plus(i * 2 + 1) }));
    expect(cleanTripWindows(many, TODAY)).toHaveLength(MAX_TRIP_WINDOWS);
    expect(cleanTripWindows([{ countryId: 'peru', from: plus(800), to: plus(810) }], TODAY)).toEqual([]);
  });
});

describe('cloudErrorText', () => {
  it('never shows raw server text', () => {
    expect(cloudErrorText(new CloudError('invalid_input', 'violates check constraint "x"'))).toBe(cloudErrorMessages.invalid_input);
    expect(cloudErrorText(new CloudError('invalid_input', 'raw', 'הטקסט קצר מדי'))).toBe('הטקסט קצר מדי');
    expect(cloudErrorText(new Error('boom'))).toBe(cloudErrorMessages.unknown);
  });

  it('uses the local date, not UTC', () => {
    expect(localToday(new Date(2026, 0, 2, 0, 30))).toBe('2026-01-02');
  });
});
