/**
 * Weekly places job (run by .github/workflows/weekly-places.yml, or locally: `npm run weekly-places`).
 *
 * 1. Health: confirms the Google key works.
 * 2. Validates the team's curated places against Google (closed? moved? not found?).
 * 3. Looks for popular new places around the main meeting hubs and proposes them.
 *
 * It never edits app data. It writes `.state/report.md` (for a GitHub issue) and
 * `.state/seen-place-ids.json` (Google place IDs only, so suggestions aren't repeated).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { places } from '../src/data/places';
import { googleCategories, getGoogleCategory } from '../src/places/categories';
import {
  VALIDATABLE,
  classifyValidation,
  MAX_SUGGESTIONS,
  dedupeCandidates,
  limitCandidates,
  mergeState,
  parseState,
  pickCandidates,
  renderReport,
  type Candidate,
  type GoogleHit,
  type ValidationResult,
} from './weeklyLogic';

const BASE = 'https://places.googleapis.com/v1';
const STATE_DIR = process.env.STATE_DIR ?? '.state';
const KEY = process.env.GOOGLE_MAPS_API_KEY;
const BUDGET = Number(process.env.MAX_REQUESTS ?? 220);

/** Meeting hubs to scan for new places: curated place id → label. Coordinates come from that place. */
const AREAS: Record<string, string> = {
  khaosan: 'בנגקוק – חאו סאן',
  'cm-walking': 'צ׳יאנג מאי',
  pai: 'פאי',
  'ta-hien': 'האנוי',
  'bui-vien': 'הו צ׳י מין',
  'vang-vieng': 'ואנג ויאנג',
  'pub-street': 'סיאם ריפ',
  paharganj: 'דלהי – פהארגאנג׳',
  'old-manali': 'מנאלי',
  rishikesh: 'רישיקש',
  thamel: 'קטמנדו – תמל',
  pokhara: 'פוקרה',
  'cusco-plaza': 'קוסקו',
  miraflores: 'לימה – מיראפלורס',
  atacama: 'סן פדרו דה אטקמה',
  palermo: 'בואנוס איירס – פלרמו',
  lapa: 'ריו – לאפה',
  poblado: 'מדיין – אל פובלדו',
  cartagena: 'קרטחנה',
  banos: 'באניוס',
  cdmx: 'מקסיקו סיטי',
  antigua: 'אנטיגואה',
  'san-pedro': 'אטיטלן – סן פדרו',
};
const DISCOVERY_CATEGORIES = ['food', 'cafe', 'lodging', 'nightlife'] as const;
const RADIUS_M = 1500;

let used = 0;
let errors = 0;
let authFailed = false;
const budgetLeft = () => BUDGET - used;

async function post(path: string, body: unknown, fieldMask: string): Promise<GoogleHit[] | undefined> {
  if (budgetLeft() <= 0 || authFailed) return undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    used++;
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY!, 'X-Goog-FieldMask': fieldMask },
        body: JSON.stringify(body),
      });
      if (res.ok) return ((await res.json()) as { places?: GoogleHit[] }).places ?? [];
      // Never print the response body: it can echo request details.
      console.error(`Google returned ${res.status} for ${path}`);
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        authFailed = true;
        errors++;
        return undefined;
      }
      if (res.status !== 429 && res.status < 500) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    } catch {
      console.error(`Network error for ${path}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  errors++;
  return undefined;
}

// Cheaper "Pro"-level fields are enough to validate; ratings (needed for ranking) only for discovery.
const VALIDATE_MASK = 'places.id,places.displayName,places.location,places.businessStatus,places.types';
const DISCOVER_MASK = `${VALIDATE_MASK},places.rating,places.userRatingCount`;

async function main() {
  if (!KEY) {
    console.log('GOOGLE_MAPS_API_KEY is not set – skipping the weekly places job.');
    return;
  }
  mkdirSync(STATE_DIR, { recursive: true });
  const now = new Date();
  const prev = parseState(safeRead(`${STATE_DIR}/seen-place-ids.json`));
  const seen = new Set(prev.seen);

  // 1 + 2. Validate curated places.
  const validation: ValidationResult[] = [];
  let firstResponse: 'ok' | 'failed' | undefined;
  const toValidate = places.filter((p) => VALIDATABLE.includes(p.category));
  for (const place of toValidate) {
    const hits = await post(
      '/places:searchText',
      { textQuery: place.name, pageSize: 3, languageCode: 'he', locationBias: { circle: { center: { latitude: place.lat, longitude: place.lng }, radius: 800 } } },
      VALIDATE_MASK,
    );
    firstResponse ??= hits ? 'ok' : 'failed';
    if (!hits) {
      if (authFailed) break;
      continue;
    }
    validation.push(classifyValidation(place, hits[0]));
    await pause();
  }

  // 3. Discover new places around the hubs.
  const candidates: Candidate[] = [];
  outer: for (const [areaId] of Object.entries(AREAS)) {
    const hub = places.find((p) => p.id === areaId);
    if (!hub) continue;
    for (const categoryId of DISCOVERY_CATEGORIES) {
      const category = getGoogleCategory(categoryId);
      if (!category) continue;
      if (budgetLeft() <= 0 || authFailed) break outer;
      const hits = await post(
        '/places:searchNearby',
        {
          includedTypes: category.types,
          maxResultCount: 20,
          rankPreference: 'POPULARITY',
          languageCode: 'en',
          locationRestriction: { circle: { center: { latitude: hub.lat, longitude: hub.lng }, radius: RADIUS_M } },
        },
        DISCOVER_MASK,
      );
      firstResponse ??= hits ? 'ok' : 'failed';
      if (hits) candidates.push(...pickCandidates(hits, seen, areaId, categoryId));
      await pause();
    }
  }

  const unique = limitCandidates(dedupeCandidates(candidates), Number(process.env.MAX_SUGGESTIONS ?? MAX_SUGGESTIONS));
  const report = renderReport({
    date: now.toISOString().slice(0, 10),
    validation,
    skippedValidation: places.length - toValidate.length,
    candidates: unique,
    areaLabels: AREAS,
    categoryLabels: Object.fromEntries(googleCategories.map((c) => [c.id, `${c.emoji} ${c.label}`])),
    requestsUsed: used,
    requestBudget: BUDGET,
    budgetExhausted: budgetLeft() <= 0,
    errors,
    health: firstResponse === 'ok' && !authFailed ? 'ok' : 'failed',
  });

  writeFileSync(`${STATE_DIR}/report.md`, report);
  writeFileSync(`${STATE_DIR}/seen-place-ids.json`, JSON.stringify(mergeState(prev, unique.map((c) => c.googlePlaceId), now), null, 2));
  console.log(`Report written: ${validation.length} validated, ${unique.length} suggestions, ${used} requests, ${errors} errors.`);

  // Make the workflow go red (and GitHub email the owner) when the key/quota is broken.
  if (authFailed || firstResponse !== 'ok') process.exitCode = 1;
}

const pause = () => new Promise((r) => setTimeout(r, 120));

function safeRead(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

main().catch((e) => {
  console.error('Weekly places job failed:', e instanceof Error ? e.message : 'unknown error');
  process.exit(1);
});
