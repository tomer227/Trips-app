/**
 * Pure logic for the weekly places job (no network, fully unit-tested).
 *
 * Privacy/terms note: the job persists only Google place IDs between runs. Names and links that
 * appear in the weekly report exist for one-off human review; ratings are used for ranking but
 * are never printed or stored.
 */
import type { Place } from '../src/data/places';
import { distanceMeters } from '../src/places/mapping';

export interface GoogleHit {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
}

/* ─── Validation of curated places ─── */

export type ValidationStatus = 'ok' | 'closed_permanently' | 'closed_temporarily' | 'moved' | 'not_found' | 'unverified';

export interface ValidationResult {
  place: Place;
  status: ValidationStatus;
  /** Distance to Google's top match, in metres */
  distanceM?: number;
  similarity?: number;
  googleName?: string;
  googlePlaceId?: string;
}

const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );

/** Jaccard similarity of word sets, 0..1. Cheap, and good enough to tell "same place" from "different place". */
export function nameSimilarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / (A.size + B.size - shared);
}

/** Categories where a Google listing is expected. Festivals and warnings are not places on a map. */
export const VALIDATABLE: Place['category'][] = ['attraction', 'food', 'cafe', 'sleep', 'party', 'gathering', 'israeli', 'service'];

/** Google types that describe a place as an area (city, neighbourhood, island...) rather than a business. */
const AREA_TYPES = ['locality', 'sublocality', 'neighborhood', 'political', 'administrative_area_level_1', 'administrative_area_level_2', 'natural_feature', 'island', 'country', 'route'];
export const isAreaHit = (hit: GoogleHit | undefined) => !!hit?.types?.some((t) => AREA_TYPES.includes(t));

/**
 * Towns, trails and regions are not businesses: Google answers with a nearby point of interest, so
 * "moved" or "not found" would be noise. For these we only look for a confident closure.
 */
export const AREA_LIKE: Place['category'][] = ['attraction', 'gathering'];

export function classifyValidation(place: Place, hit: GoogleHit | undefined): ValidationResult {
  // A curated 'party' or 'sleep' entry can still be a whole neighbourhood; Google's own type tells us.
  const areaLike = AREA_LIKE.includes(place.category) || isAreaHit(hit);
  const lat = hit?.location?.latitude;
  const lng = hit?.location?.longitude;
  if (!hit?.id || typeof lat !== 'number' || typeof lng !== 'number') return { place, status: AREA_LIKE.includes(place.category) ? 'unverified' : 'not_found' };

  const distanceM = Math.round(distanceMeters(place, { lat, lng }));
  const googleName = hit.displayName?.text;
  const similarity = googleName ? nameSimilarity(place.name, googleName) : 0;
  const base = { place, distanceM, similarity: Math.round(similarity * 100) / 100, googleName, googlePlaceId: hit.id };

  // A far-away hit with an unrelated name is a different place: don't trust it for anything.
  const confident = similarity >= 0.3 || distanceM < 150;
  if (confident && hit.businessStatus === 'CLOSED_PERMANENTLY') return { ...base, status: 'closed_permanently' };
  if (confident && hit.businessStatus === 'CLOSED_TEMPORARILY') return { ...base, status: 'closed_temporarily' };

  if (areaLike) return { ...base, status: confident ? 'ok' : 'unverified' };
  // A different business nearby says nothing about ours; only "no result at all" is a signal.
  if (!confident) return { ...base, status: 'unverified' };
  if (distanceM > 400 && similarity >= 0.5) return { ...base, status: 'moved' };
  return { ...base, status: 'ok' };
}

/* ─── Discovery of new places ─── */

export interface Candidate {
  googlePlaceId: string;
  name: string;
  areaId: string;
  categoryId: string;
  types: string[];
  lat: number;
  lng: number;
  /** Used only for ordering; never printed or stored */
  score: number;
}

export const MIN_RATING = 4.4;
export const MIN_RATINGS_COUNT = 200;
export const PER_QUERY = 3;
export const MAX_SUGGESTIONS = 25;

export function pickCandidates(hits: GoogleHit[], seen: ReadonlySet<string>, areaId: string, categoryId: string, limit = PER_QUERY): Candidate[] {
  return hits
    .flatMap((h) => {
      const lat = h.location?.latitude;
      const lng = h.location?.longitude;
      const name = h.displayName?.text?.trim();
      if (!h.id || !name || typeof lat !== 'number' || typeof lng !== 'number') return [];
      if (seen.has(h.id)) return [];
      if (h.businessStatus && h.businessStatus !== 'OPERATIONAL') return [];
      if ((h.rating ?? 0) < MIN_RATING || (h.userRatingCount ?? 0) < MIN_RATINGS_COUNT) return [];
      // Rating matters, but a rating from 5,000 people is more trustworthy than one from 200.
      const score = (h.rating ?? 0) * Math.log10(h.userRatingCount ?? 1);
      return [{ googlePlaceId: h.id, name, areaId, categoryId, types: h.types ?? [], lat, lng, score }];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Caps the weekly list, spreading it across areas (best candidate of each area first). Unsuggested
 * candidates are not marked as seen, so they can show up in later weeks.
 */
export function limitCandidates(list: Candidate[], max: number): Candidate[] {
  const byArea = new Map<string, Candidate[]>();
  for (const c of [...list].sort((a, b) => b.score - a.score)) byArea.set(c.areaId, [...(byArea.get(c.areaId) ?? []), c]);
  const queues = [...byArea.values()];
  const out: Candidate[] = [];
  for (let round = 0; out.length < max && queues.some((q) => q.length > round); round++) {
    for (const q of queues) if (q[round] && out.length < max) out.push(q[round]);
  }
  return out;
}

/** Removes candidates already suggested by an earlier area/category in the same run. */
export function dedupeCandidates(list: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.googlePlaceId) ? false : (seen.add(c.googlePlaceId), true)));
}

/* ─── State (place IDs only) ─── */

export interface SeenState {
  seen: string[];
  updatedAt?: string;
}

const MAX_SEEN = 5000;

export function parseState(json: string | undefined): SeenState {
  try {
    const data = JSON.parse(json ?? '');
    return { seen: Array.isArray(data?.seen) ? data.seen.filter((x: unknown): x is string => typeof x === 'string') : [] };
  } catch {
    return { seen: [] };
  }
}

export function mergeState(prev: SeenState, newIds: string[], now: Date): SeenState {
  const merged = [...new Set([...prev.seen, ...newIds])];
  return { seen: merged.slice(-MAX_SEEN), updatedAt: now.toISOString() };
}

/* ─── Report ─── */

export interface Report {
  date: string;
  validation: ValidationResult[];
  skippedValidation: number;
  candidates: Candidate[];
  areaLabels: Record<string, string>;
  categoryLabels: Record<string, string>;
  requestsUsed: number;
  requestBudget: number;
  budgetExhausted: boolean;
  errors: number;
  health: 'ok' | 'failed';
}

const mapsLink = (id: string, name: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${id}`;

export function renderReport(r: Report): string {
  const unverified = r.validation.filter((v) => v.status === 'unverified').length;
  const problems = r.validation.filter((v) => v.status !== 'ok' && v.status !== 'unverified');
  const closed = problems.filter((v) => v.status === 'closed_permanently' || v.status === 'closed_temporarily');
  const moved = problems.filter((v) => v.status === 'moved');
  const notFound = problems.filter((v) => v.status === 'not_found');
  const ok = r.validation.length - problems.length - unverified;
  const lines: string[] = [];

  lines.push(`# דוח מקומות שבועי – ${r.date}`, '');
  lines.push(
    `- 🩺 חיבור ל־Google: ${r.health === 'ok' ? '✅ תקין' : '❌ נכשל – בדקו מפתח, מכסות וחיוב'}`,
    `- 📊 בקשות בריצה: ${r.requestsUsed}/${r.requestBudget}${r.budgetExhausted ? ' (⚠️ התקציב נגמר, חלק מהבדיקות דולגו)' : ''}${r.errors ? ` · ${r.errors} שגיאות` : ''}`,
    `- ✅ נבדקו ${r.validation.length} מקומות של הצוות: ${ok} תקינים, ${problems.length} דורשים תשומת לב${unverified ? `, ${unverified} אזורים ואטרקציות כלליים ללא אימות (נבדקים רק לסגירה)` : ''}${r.skippedValidation ? ` · ${r.skippedValidation} דולגו: פסטיבלים ואזהרות אינם מקומות במפה` : ''}`,
    `- 🆕 ${r.candidates.length} הצעות למקומות חדשים`,
    '',
  );

  lines.push('## 1. בדיקת המקומות הקיימים', '');
  if (!problems.length) lines.push('הכול תקין. 🎉', '');
  const table = (title: string, rows: ValidationResult[], why: (v: ValidationResult) => string) => {
    if (!rows.length) return;
    lines.push(`### ${title} (${rows.length})`, '', '| מקום | קטגוריה | פירוט |', '| --- | --- | --- |');
    for (const v of rows) lines.push(`| \`${v.place.id}\` ${v.place.name.replace(/\|/g, '/')} | ${v.place.category} | ${why(v)} |`);
    lines.push('');
  };
  table('🚫 Google מדווחת שנסגר', closed, (v) => (v.status === 'closed_permanently' ? 'סגור לצמיתות' : 'סגור זמנית') + (v.googleName ? ` (${v.googleName})` : ''));
  table('📍 המיקום שונה מהתוצאה של Google', moved, (v) => `הפרש של ${v.distanceM} מ׳ מ־${v.googleName ?? 'התוצאה הראשונה'}`);
  table('❓ Google לא מכירה את המקום בסביבה', notFound, () => 'אין תוצאה ברדיוס 800 מ׳. ייתכן שנסגר או שהשם/המיקום שגויים');
  if (problems.length) {
    lines.push('> ההתאמה לפי שם ומרחק היא הערכה. בדקו לפני שמשנים.', '');
  }

  lines.push('## 2. הצעות למקומות חדשים', '');
  if (!r.candidates.length) {
    lines.push('אין הצעות חדשות השבוע.', '');
  } else {
    lines.push('פופולריים ומדורגים גבוה ב־Google באזורי המפגש, ועוד לא הוצעו בעבר. **הם לא נוספו לאפליקציה.** כדי להוסיף מקום, כתבו ל־Claude "תוסיף את …" (מומלץ עם משפט משלכם על המקום).', '');
    const byArea = new Map<string, Candidate[]>();
    for (const c of r.candidates) byArea.set(c.areaId, [...(byArea.get(c.areaId) ?? []), c]);
    for (const [areaId, list] of byArea) {
      lines.push(`### ${r.areaLabels[areaId] ?? areaId}`);
      for (const c of list) lines.push(`- [ ] **${c.name}** – ${r.categoryLabels[c.categoryId] ?? c.categoryId} · [במפות](${mapsLink(c.googlePlaceId, c.name)}) · \`${c.googlePlaceId}\``);
      lines.push('');
    }
  }

  lines.push(
    '---',
    '**מה השבוע לא עודכן ולמה:** דירוגים, שעות פתיחה ותמונות נטענים ישירות מ־Google בכל פתיחת מקום באפליקציה, ולכן תמיד עדכניים. תנאי Google אינם מאפשרים לשמור אותם במאגר, ולכן הריצה שומרת בין שבוע לשבוע רק מזהי מקומות.',
    '',
    '_נוצר אוטומטית מ־`scripts/weekly-places.ts`._',
  );
  return lines.join('\n');
}
