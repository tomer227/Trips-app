import { describe, expect, it } from 'vitest';
import {
  emptySafety,
  normalizePhone,
  okMessage,
  okReminderDue,
  parseEmergency,
  telHref,
  trekMessage,
  trekStatus,
  whatsappUrl,
  type TrekPlan,
} from './safety';
import { countries } from './data/countries';

const trek: TrekPlan = {
  name: 'סנטה קרוז',
  countryId: 'peru',
  startDate: '2026-11-01',
  returnDate: '2026-11-04',
  route: 'וואראס – קאשאפמפה',
  companions: 'נועה ואיתי',
};

describe('normalizePhone', () => {
  it('turns Israeli local numbers into international ones', () => {
    expect(normalizePhone('052-123-4567')).toBe('972521234567');
    expect(normalizePhone('+972 52 123 4567')).toBe('972521234567');
    expect(normalizePhone('00972521234567')).toBe('972521234567');
    expect(normalizePhone('+1 (415) 555-0100')).toBe('14155550100');
  });

  it('rejects things that are not phone numbers', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('אמא')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });

  it('builds a WhatsApp link, falling back to the contact chooser', () => {
    expect(whatsappUrl('0521234567', 'היי')).toBe('https://wa.me/972521234567?text=%D7%94%D7%99%D7%99');
    expect(whatsappUrl('', 'hi')).toBe('https://wa.me/?text=hi');
  });
});

describe('messages', () => {
  it('says where I am and links to the map when location is known', () => {
    const text = okMessage({ place: 'קוסקו', coords: { lat: -13.532, lng: -71.9675 }, now: Date.UTC(2026, 9, 18, 15, 5) });
    expect(text).toContain('אני בסדר');
    expect(text).toContain('אני בקוסקו');
    expect(text).toContain('https://maps.google.com/?q=-13.53200,-71.96750');
  });

  it('tells the family exactly when to worry and who to call', () => {
    const profile = { ...emptySafety.profile, insuranceCompany: 'הראל', insurancePhone: '+972-3-1234567', policyNumber: 'A1' };
    const text = trekMessage(trek, profile, 'פרו', 'משטרה 105 · אמבולנס 106');
    expect(text).toContain('סנטה קרוז בפרו');
    expect(text).toContain('חזרה מתוכננת: 4.11.2026');
    expect(text).toContain('עד 5.11.2026 בערב');
    expect(text).toContain('1. מוקד הביטוח (הראל): +972-3-1234567 · פוליסה A1');
    expect(text).toContain('2. חדר המצב של משרד החוץ');
    expect(text).toContain('3. חירום מקומי: משטרה 105');
  });

  it('skips the insurance line when there are no details', () => {
    const text = trekMessage(trek, emptySafety.profile, 'פרו', '');
    expect(text).toContain('1. חדר המצב של משרד החוץ');
    expect(text).not.toContain('ביטוח');
  });
});

describe('trekStatus', () => {
  it('moves from upcoming to overdue', () => {
    expect(trekStatus(trek, '2026-10-31')).toBe('upcoming');
    expect(trekStatus(trek, '2026-11-01')).toBe('on-trail');
    expect(trekStatus(trek, '2026-11-04')).toBe('on-trail');
    expect(trekStatus(trek, '2026-11-05')).toBe('late');
    expect(trekStatus(trek, '2026-11-06')).toBe('overdue');
  });
});

describe('okReminderDue', () => {
  const day = 86400000;
  const withContact = { ...emptySafety, profile: { ...emptySafety.profile, contactPhone: '0521234567' } };

  it('stays quiet until someone is set to receive it', () => {
    expect(okReminderDue(emptySafety, Date.now())).toBe(false);
  });

  it('nudges when it was never sent or sent long enough ago', () => {
    const now = 100 * day;
    expect(okReminderDue(withContact, now)).toBe(true);
    expect(okReminderDue({ ...withContact, lastOkAt: now - 2 * day }, now)).toBe(false);
    expect(okReminderDue({ ...withContact, lastOkAt: now - 3 * day }, now)).toBe(true);
    expect(okReminderDue({ ...withContact, remindEveryDays: 0 }, now)).toBe(false);
  });
});

describe('parseEmergency', () => {
  it('splits the country emergency line into callable numbers', () => {
    expect(parseEmergency('משטרת תיירות 1155 · אמבולנס 1669 · משטרה 191')).toEqual([
      { label: 'משטרת תיירות', number: '1155' },
      { label: 'אמבולנס', number: '1669' },
      { label: 'משטרה', number: '191' },
    ]);
    expect(telHref('+972-2-5303155')).toBe('tel:+97225303155');
  });

  it('finds at least one number for every country', () => {
    for (const c of countries) expect(parseEmergency(c.emergency).length, c.id).toBeGreaterThan(0);
  });
});
