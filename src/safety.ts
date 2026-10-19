/**
 * "Safety net": a light-weight way to keep family in the loop without live GPS tracking.
 * Everything stays on the device; messages go out through WhatsApp (or the share sheet) only when the traveller taps.
 */
import type { Coords } from './geo';

export interface SafetyProfile {
  contactName: string;
  /** Phone of the person back home, any format – normalised for WhatsApp */
  contactPhone: string;
  insuranceCompany: string;
  insurancePhone: string;
  policyNumber: string;
  bloodType: string;
  medical: string;
}

export interface TrekPlan {
  name: string;
  countryId: string;
  startDate: string; // YYYY-MM-DD
  returnDate: string; // YYYY-MM-DD
  route: string;
  companions: string;
}

export interface SafetyState {
  profile: SafetyProfile;
  /** When "I'm OK" was last sent (ms) */
  lastOkAt: number | null;
  trek: TrekPlan | null;
  /** How often to nudge for an "I'm OK" message, in days */
  remindEveryDays: number;
}

export const emptySafety: SafetyState = {
  profile: { contactName: '', contactPhone: '', insuranceCompany: '', insurancePhone: '', policyNumber: '', bloodType: '', medical: '' },
  lastOkAt: null,
  trek: null,
  remindEveryDays: 3,
};

/** Foreign Ministry situation room for Israelis abroad (24/7). */
export const MFA_EMERGENCY = '+972-2-5303155';

/**
 * Digits for wa.me: Israeli local numbers (05x…) become 9725x…; numbers with + or 00 keep their country code.
 * Returns null if it doesn't look like a phone number.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = `972${digits.slice(1)}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** WhatsApp link to a specific person, or the generic chooser when there's no number. */
export function whatsappUrl(phone: string, text: string): string {
  const digits = normalizePhone(phone);
  return `https://wa.me/${digits ?? ''}?text=${encodeURIComponent(text)}`;
}

export function mapsLink(c: Coords): string {
  return `https://maps.google.com/?q=${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
}

function clock(now: number): string {
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

export function okMessage(opts: { place?: string; coords?: Coords | null; note?: string; now: number }): string {
  const lines = [`💚 אני בסדר! (${clock(opts.now)})`];
  if (opts.place) lines.push(`📍 אני ב${opts.place}`);
  if (opts.note?.trim()) lines.push(opts.note.trim());
  if (opts.coords) lines.push(`המיקום שלי: ${mapsLink(opts.coords)}`);
  lines.push('נשלח מ"הטיול הגדול" 🎒');
  return lines.join('\n');
}

export function trekMessage(trek: TrekPlan, profile: SafetyProfile, countryName: string, countryEmergency: string): string {
  const deadline = formatIsoDate(addDaysIso(trek.returnDate, 1));
  const lines = [
    `🥾 יוצא/ת ל${trek.name || 'טרק'}${countryName ? ` ב${countryName}` : ''}`,
    `יציאה: ${formatIsoDate(trek.startDate)} · חזרה מתוכננת: ${formatIsoDate(trek.returnDate)}`,
  ];
  if (trek.route.trim()) lines.push(`מסלול: ${trek.route.trim()}`);
  if (trek.companions.trim()) lines.push(`איתי: ${trek.companions.trim()}`);
  lines.push('', 'ייתכן שלא תהיה קליטה בדרך – זה נורמלי.', `אם לא שמעתם ממני עד ${deadline} בערב:`);
  let step = 1;
  if (profile.insurancePhone.trim()) {
    lines.push(`${step++}. מוקד הביטוח${profile.insuranceCompany ? ` (${profile.insuranceCompany})` : ''}: ${profile.insurancePhone.trim()}${profile.policyNumber ? ` · פוליסה ${profile.policyNumber}` : ''}`);
  }
  lines.push(`${step++}. חדר המצב של משרד החוץ: ${MFA_EMERGENCY}`);
  if (countryEmergency) lines.push(`${step++}. חירום מקומי: ${countryEmergency}`);
  return lines.join('\n');
}

export function backMessage(trek: TrekPlan): string {
  return `✅ חזרתי בשלום מ${trek.name || 'הטרק'}! 🙌`;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type TrekStatus = 'upcoming' | 'on-trail' | 'late' | 'overdue';

/**
 * 'late' = the planned return day has passed; 'overdue' = past the deadline the family was given (the day after).
 * `today` is the local date (YYYY-MM-DD).
 */
export function trekStatus(trek: TrekPlan, today: string): TrekStatus {
  if (today < trek.startDate) return 'upcoming';
  if (today <= trek.returnDate) return 'on-trail';
  if (today <= addDaysIso(trek.returnDate, 1)) return 'late';
  return 'overdue';
}

export function daysSince(ts: number | null, now: number): number | null {
  return ts === null ? null : Math.floor((now - ts) / 86400000);
}

/** Time to remind the traveller to send an "I'm OK"? Only once they've set someone to send it to. */
export function okReminderDue(state: SafetyState, now: number): boolean {
  if (!state.profile.contactPhone.trim() || state.remindEveryDays <= 0) return false;
  const since = daysSince(state.lastOkAt, now);
  return since === null || since >= state.remindEveryDays;
}

export interface EmergencyNumber {
  label: string;
  number: string;
}

/** "משטרה 110 · אמבולנס 118" -> [{label:'משטרה', number:'110'}, …] */
export function parseEmergency(text: string): EmergencyNumber[] {
  return text
    .split('·')
    .map((part) => part.trim())
    .map((part) => {
      const match = part.match(/^(.*?)\s*(\+?[\d-]{2,})$/);
      return match ? { label: match[1].trim() || 'חירום', number: match[2] } : null;
    })
    .filter((x): x is EmergencyNumber => x !== null);
}

export function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`;
}
