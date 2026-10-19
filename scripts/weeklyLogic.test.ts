import { describe, expect, it } from 'vitest';
import { places, type Place } from '../src/data/places';
import {
  MIN_RATING,
  classifyValidation,
  isAreaHit,
  dedupeCandidates,
  limitCandidates,
  mergeState,
  nameSimilarity,
  parseState,
  pickCandidates,
  renderReport,
  type GoogleHit,
  type Report,
} from './weeklyLogic';

const place = (over: Partial<Place> = {}): Place => ({ id: 'p1', countryId: 'thailand', name: 'Khao San Road', category: 'food', lat: 13.759, lng: 100.497, desc: '', ...over });
const hit = (over: GoogleHit = {}): GoogleHit => ({
  id: 'ChIJaaaaaaaaaa',
  displayName: { text: 'Khao San Road' },
  location: { latitude: 13.759, longitude: 100.497 },
  businessStatus: 'OPERATIONAL',
  types: ['cafe'],
  rating: 4.7,
  userRatingCount: 1500,
  ...over,
});

describe('nameSimilarity', () => {
  it('is 1 for identical names, 0 for unrelated, and ignores case and punctuation', () => {
    expect(nameSimilarity('Khao San Road', 'khao-san road!')).toBe(1);
    expect(nameSimilarity('Khao San Road', 'Cafe Aroi')).toBe(0);
    expect(nameSimilarity('אנגקור וואט', 'אנגקור וואט (סיאם ריפ)')).toBeGreaterThanOrEqual(0.5);
    expect(nameSimilarity('', 'x')).toBe(0);
  });
});

describe('classifyValidation', () => {
  it('accepts a nearby, similarly named, operating place', () => {
    expect(classifyValidation(place(), hit()).status).toBe('ok');
  });

  it('reports "not found" only when Google returns nothing at all', () => {
    expect(classifyValidation(place(), undefined).status).toBe('not_found');
    expect(classifyValidation(place(), hit({ location: undefined })).status).toBe('not_found');
  });

  it('does not treat a different nearby business as a sign that ours is gone', () => {
    const other = hit({ displayName: { text: 'Totally Different' }, location: { latitude: 13.769, longitude: 100.497 } });
    expect(classifyValidation(place(), other).status).toBe('unverified');
  });

  it('treats a whole neighbourhood or city as an area even under a business category', () => {
    const neighbourhood = hit({ displayName: { text: 'Khao San Road' }, types: ['neighborhood', 'political'], location: { latitude: 13.79, longitude: 100.497 } });
    expect(classifyValidation(place({ category: 'party' }), neighbourhood).status).toBe('ok');
    expect(isAreaHit(neighbourhood)).toBe(true);
    expect(isAreaHit(hit())).toBe(false);
  });

  it('flags closures only when the match is confident', () => {
    expect(classifyValidation(place(), hit({ businessStatus: 'CLOSED_PERMANENTLY' })).status).toBe('closed_permanently');
    expect(classifyValidation(place(), hit({ businessStatus: 'CLOSED_TEMPORARILY' })).status).toBe('closed_temporarily');
    // A closed place with an unrelated name 1 km away is a different business: not our place.
    const other = hit({ displayName: { text: 'Totally Different' }, businessStatus: 'CLOSED_PERMANENTLY', location: { latitude: 13.769, longitude: 100.497 } });
    expect(classifyValidation(place(), other).status).toBe('unverified');
  });

  it('flags a moved place when the coordinates differ a lot but the name matches', () => {
    const far = hit({ location: { latitude: 13.7645, longitude: 100.497 } }); // ~600 m
    const res = classifyValidation(place(), far);
    expect(res.status).toBe('moved');
    expect(res.distanceM).toBeGreaterThan(400);
  });

  it('does not report towns, trails and regions as moved or missing – only confident closures', () => {
    const town = place({ category: 'attraction', name: 'Ella' });
    const farPoi = hit({ displayName: { text: 'Some Viewpoint' }, location: { latitude: 13.79, longitude: 100.497 } });
    expect(classifyValidation(town, farPoi).status).toBe('unverified');
    expect(classifyValidation(town, undefined).status).toBe('unverified');
    expect(classifyValidation(town, hit({ displayName: { text: 'Ella' }, location: { latitude: 13.7645, longitude: 100.497 } })).status).toBe('ok');
    expect(classifyValidation(place({ category: 'gathering' }), hit({ businessStatus: 'CLOSED_PERMANENTLY' })).status).toBe('closed_permanently');
  });

  it('keeps small coordinate differences as ok', () => {
    expect(classifyValidation(place(), hit({ location: { latitude: 13.7605, longitude: 100.497 } })).status).toBe('ok');
  });
});

describe('pickCandidates', () => {
  const hits = [
    hit({ id: 'ChIJhigh000000', displayName: { text: 'High' }, rating: 4.9, userRatingCount: 5000 }),
    hit({ id: 'ChIJmid0000000', displayName: { text: 'Mid' }, rating: 4.6, userRatingCount: 400 }),
    hit({ id: 'ChIJlowrate0000', displayName: { text: 'LowRating' }, rating: MIN_RATING - 0.1, userRatingCount: 9000 }),
    hit({ id: 'ChIJfew0000000', displayName: { text: 'Few' }, rating: 4.9, userRatingCount: 50 }),
    hit({ id: 'ChIJclosed00000', displayName: { text: 'Closed' }, businessStatus: 'CLOSED_PERMANENTLY' }),
    hit({ id: 'ChIJseen0000000', displayName: { text: 'Seen' } }),
    { id: 'ChIJnoname00000', location: { latitude: 1, longitude: 1 }, rating: 5, userRatingCount: 999 },
  ];

  it('keeps only highly rated, well reviewed, operating, unseen places, best first', () => {
    const picked = pickCandidates(hits, new Set(['ChIJseen0000000']), 'khaosan', 'food');
    expect(picked.map((c) => c.name)).toEqual(['High', 'Mid']);
    expect(picked[0]).toMatchObject({ areaId: 'khaosan', categoryId: 'food', googlePlaceId: 'ChIJhigh000000' });
  });

  it('respects the limit and can return nothing', () => {
    expect(pickCandidates(hits, new Set(), 'a', 'food', 1)).toHaveLength(1);
    expect(pickCandidates([], new Set(), 'a', 'food')).toEqual([]);
  });

  it('does not repeat a place suggested by two queries', () => {
    const a = pickCandidates([hits[0]], new Set(), 'a', 'food');
    const b = pickCandidates([hits[0]], new Set(), 'a', 'cafe');
    expect(dedupeCandidates([...a, ...b])).toHaveLength(1);
  });
});

describe('limitCandidates', () => {
  const c = (areaId: string, n: number, score: number) => ({ googlePlaceId: `${areaId}${n}`, name: '', areaId, categoryId: 'food', types: [], lat: 0, lng: 0, score });

  it('spreads the cap across areas, best of each area first', () => {
    const list = [c('a', 1, 10), c('a', 2, 9), c('a', 3, 8), c('b', 1, 5), c('c', 1, 6)];
    expect(limitCandidates(list, 4).map((x) => x.googlePlaceId)).toEqual(['a1', 'c1', 'b1', 'a2']);
    expect(limitCandidates(list, 100)).toHaveLength(5);
    expect(limitCandidates([], 3)).toEqual([]);
  });
});

describe('state (place ids only)', () => {
  it('parses safely and merges without duplicates', () => {
    expect(parseState(undefined)).toEqual({ seen: [] });
    expect(parseState('not json')).toEqual({ seen: [] });
    expect(parseState('{"seen":["a",5,"b"]}')).toEqual({ seen: ['a', 'b'] });
    const now = new Date('2026-01-05T06:00:00Z');
    expect(mergeState({ seen: ['a', 'b'] }, ['b', 'c'], now)).toEqual({ seen: ['a', 'b', 'c'], updatedAt: now.toISOString() });
  });

  it('stays bounded', () => {
    const many = Array.from({ length: 6000 }, (_, i) => `id${i}`);
    const merged = mergeState({ seen: [] }, many, new Date());
    expect(merged.seen).toHaveLength(5000);
    expect(merged.seen.at(-1)).toBe('id5999');
  });

  it('never stores ratings or names', () => {
    const merged = mergeState({ seen: [] }, ['ChIJabc'], new Date());
    expect(Object.keys(merged).sort()).toEqual(['seen', 'updatedAt']);
    expect(merged.seen).toEqual(['ChIJabc']);
  });
});

describe('renderReport', () => {
  const base: Report = {
    date: '2026-01-05',
    validation: [],
    skippedValidation: 3,
    candidates: [],
    areaLabels: { khaosan: 'בנגקוק' },
    categoryLabels: { food: '🍜 אוכל' },
    requestsUsed: 10,
    requestBudget: 220,
    budgetExhausted: false,
    errors: 0,
    health: 'ok',
  };

  it('says everything is fine when there is nothing to report', () => {
    const md = renderReport(base);
    expect(md).toContain('דוח מקומות שבועי – 2026-01-05');
    expect(md).toContain('✅ תקין');
    expect(md).toContain('הכול תקין');
    expect(md).toContain('אין הצעות חדשות');
  });

  it('lists problems and suggestions, without ratings, and explains what is not stored', () => {
    const md = renderReport({
      ...base,
      validation: [
        { place: place({ id: 'bar1', name: 'Bar | Name', category: 'party' }), status: 'closed_permanently', googleName: 'Bar Name' },
        { place: place({ id: 'r1' }), status: 'moved', distanceM: 640, googleName: 'Khao San' },
        { place: place({ id: 'x1' }), status: 'not_found' },
        { place: place({ id: 'ok1' }), status: 'ok' },
        { place: place({ id: 'u1', category: 'attraction' }), status: 'unverified' },
      ],
      candidates: [{ googlePlaceId: 'ChIJabc1234567', name: 'Nice Cafe', areaId: 'khaosan', categoryId: 'food', types: [], lat: 1, lng: 2, score: 17.3 }],
      health: 'failed',
      budgetExhausted: true,
      errors: 2,
    });
    expect(md).toContain('❌ נכשל');
    expect(md).toContain('התקציב נגמר');
    expect(md).toContain('סגור לצמיתות');
    expect(md).toContain('Bar / Name'); // pipes escaped so the table stays valid
    expect(md).toContain('640 מ׳');
    expect(md).toContain('- [ ] **Nice Cafe**');
    expect(md).toContain('query_place_id=ChIJabc1234567');
    expect(md).not.toMatch(/17\.3|4\.[0-9] ?⭐|⭐/); // ratings/scores are never printed
    expect(md).toContain('לא עודכן ולמה');
    expect(md).toContain('1 אזורים ואטרקציות כלליים ללא אימות');
    expect(md).not.toContain('`u1`'); // unverified areas are counted, not listed
  });
});

describe('configuration', () => {
  it('only validates categories that exist as places on a map', () => {
    const categories = new Set(places.map((p) => p.category));
    expect(categories.has('festival')).toBe(true);
  });
});
