import { describe, expect, it } from 'vitest';
import {
  addDays,
  cities,
  formatTime,
  holidayOn,
  shabbatTimes,
  sunsetAt,
  upcomingFriday,
  upcomingHolidays,
  weekday,
  ZENITH_TZEIT,
} from './jewish';
import { getCountry } from './data/countries';

const minutesOfDayUtc = (ts: number) => {
  const d = new Date(ts);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

describe('sunsetAt', () => {
  it('matches published sunset times within a few minutes', () => {
    // London, summer solstice: 21:21 BST = 20:21 UTC
    expect(Math.abs(minutesOfDayUtc(sunsetAt('2026-06-21', 51.5074, -0.1278)!) - (20 * 60 + 21))).toBeLessThanOrEqual(3);
    // Jerusalem, summer solstice: ~19:48 IDT = 16:48 UTC
    expect(Math.abs(minutesOfDayUtc(sunsetAt('2026-06-21', 31.7683, 35.2137)!) - (16 * 60 + 48))).toBeLessThanOrEqual(3);
  });

  it('lands on the right UTC day far east and far west', () => {
    // Tokyo sunset is ~09:00 UTC on the same date; Lima ~23:00 UTC on the same date.
    const tokyo = sunsetAt('2026-10-16', 35.6762, 139.6503)!;
    expect(new Date(tokyo).toISOString().slice(0, 10)).toBe('2026-10-16');
    const lima = sunsetAt('2026-10-16', -12.0464, -77.0428)!;
    expect(new Date(lima).toISOString().slice(0, 10)).toBe('2026-10-16');
    expect(formatTime(lima, 'America/Lima')).toMatch(/^18:/);
  });

  it('nightfall is after sunset', () => {
    const sunset = sunsetAt('2026-10-17', 27.7172, 85.324)!;
    const tzeit = sunsetAt('2026-10-17', 27.7172, 85.324, ZENITH_TZEIT)!;
    expect(tzeit - sunset).toBeGreaterThan(20 * 60000);
    expect(tzeit - sunset).toBeLessThan(50 * 60000);
  });

  it('returns null when the sun never sets', () => {
    expect(sunsetAt('2026-06-21', 78.22, 15.65)).toBeNull();
  });
});

describe('shabbatTimes', () => {
  it('lights candles 18 minutes before sunset and ends at nightfall on Saturday', () => {
    const t = shabbatTimes('2026-10-16', 27.7172, 85.324);
    expect(t.saturday).toBe('2026-10-17');
    expect(sunsetAt('2026-10-16', 27.7172, 85.324)! - t.candles!).toBe(18 * 60000);
    expect(formatTime(t.candles!, 'Asia/Kathmandu')).toMatch(/^17:/);
    expect(formatTime(t.havdalah!, 'Asia/Kathmandu')).toMatch(/^18:/);
  });
});

describe('dates', () => {
  it('finds the coming Friday, or this Shabbat on Saturday', () => {
    expect(upcomingFriday('2026-10-14')).toBe('2026-10-16'); // Wednesday
    expect(upcomingFriday('2026-10-16')).toBe('2026-10-16'); // Friday
    expect(upcomingFriday('2026-10-17')).toBe('2026-10-16'); // Saturday
    expect(upcomingFriday('2026-10-18')).toBe('2026-10-23'); // Sunday
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(weekday('2026-10-18')).toBe(0);
  });
});

describe('holidays', () => {
  it('knows the 5787 holidays', () => {
    expect(holidayOn('2026-09-12')).toBe('rosh-hashana');
    expect(holidayOn('2026-09-21')).toBe('yom-kippur');
    expect(holidayOn('2026-09-26')).toBe('sukkot');
    expect(holidayOn('2026-12-05')).toBe('hanukkah');
    expect(holidayOn('2027-03-23')).toBe('purim'); // leap year: 14 Adar II
    expect(holidayOn('2027-02-21')).toBeNull(); // 14 Adar I is not Purim
    expect(holidayOn('2027-04-22')).toBe('pesach');
    expect(holidayOn('2027-05-11')).toBe('yom-hazikaron');
    expect(holidayOn('2027-05-12')).toBe('yom-haatzmaut');
    expect(holidayOn('2027-06-11')).toBe('shavuot');
  });

  it('moves Independence Day away from Shabbat', () => {
    // 5 Iyar 5786 fell on a Wednesday (22 Apr 2026); 5 Iyar 5785 on a Saturday (3 May 2025) -> Thursday 1 May.
    expect(holidayOn('2026-04-22')).toBe('yom-haatzmaut');
    expect(holidayOn('2025-05-01')).toBe('yom-haatzmaut');
    expect(holidayOn('2025-04-30')).toBe('yom-hazikaron');
    expect(holidayOn('2025-05-03')).toBeNull();
  });

  it('pushes Tisha BeAv off Shabbat', () => {
    // 9 Av 5785 was Saturday 2 Aug 2025 -> fast on Sunday 3 Aug.
    expect(holidayOn('2025-08-02')).toBeNull();
    expect(holidayOn('2025-08-03')).toBe('tisha-bav');
  });

  it('lists upcoming holidays in order, including one in progress', () => {
    const list = upcomingHolidays('2026-09-29', 90);
    expect(list[0]).toMatchObject({ id: 'sukkot', date: '2026-09-26', inDays: -3 });
    expect(list.map((h) => h.id)).toEqual(['sukkot', 'simchat-torah', 'hanukkah']);
    expect(list[2].hebrew).toContain('כסלו');
  });
});

describe('cities', () => {
  it('every city belongs to a known country and has a valid time zone', () => {
    for (const c of cities) {
      expect(getCountry(c.countryId), c.id).toBeDefined();
      expect(() => new Intl.DateTimeFormat('en', { timeZone: c.tz })).not.toThrow();
    }
  });
});
