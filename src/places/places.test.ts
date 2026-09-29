import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlacesError, createPlacesApi, newSessionToken } from './api';
import { getGoogleCategory, googleCategories, pinCategoryForTypes } from './categories';
import { applyFilters, dedupePlaces, distanceMeters, googleMapsUrl, googleToPlace, mapGoogleResults, mergeDetails, priceSymbols, sortPlaces, type GooglePlaceRaw } from './mapping';
import { debounce, runSearch } from './search';
import { places as curated } from '../data/places';

const raw = (over: GooglePlaceRaw = {}): GooglePlaceRaw => ({
  id: 'ChIJabcdefghij',
  displayName: { text: 'Cafe Aroi' },
  location: { latitude: 13.75, longitude: 100.5 },
  formattedAddress: '1 Khao San Rd',
  types: ['cafe', 'food'],
  rating: 4.6,
  userRatingCount: 1234,
  priceLevel: 'PRICE_LEVEL_MODERATE',
  currentOpeningHours: { openNow: true },
  ...over,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const asFetch = (fn: unknown) => fn as unknown as typeof fetch;

describe('googleToPlace (mapping)', () => {
  it('maps a Google place to an app place marked as external', () => {
    const p = googleToPlace(raw(), { category: getGoogleCategory('cafe'), fetchedAt: '2026-01-01T00:00:00Z' })!;
    expect(p).toMatchObject({
      id: 'g:ChIJabcdefghij',
      source: 'google',
      googlePlaceId: 'ChIJabcdefghij',
      name: 'Cafe Aroi',
      category: 'cafe',
      lat: 13.75,
      rating: 4.6,
      userRatingCount: 1234,
      priceLevel: 'moderate',
      openNow: true,
      sourceUpdatedAt: '2026-01-01T00:00:00Z',
    });
    // A Google place is never presented as team- or community-curated.
    expect(p.israeli).toBeUndefined();
    expect(p.custom).toBeUndefined();
  });

  it('does not invent missing fields', () => {
    const p = googleToPlace({ id: 'ChIJabcdefghij', displayName: { text: 'X' }, location: { latitude: 1, longitude: 2 } })!;
    expect(p.rating).toBeUndefined();
    expect(p.priceLevel).toBeUndefined();
    expect(p.openNow).toBeUndefined();
    expect(p.openingHours).toBeUndefined();
    expect(p.phone).toBeUndefined();
  });

  it('treats missing openNow as unknown, not closed', () => {
    expect(googleToPlace(raw({ currentOpeningHours: undefined }))!.openNow).toBeUndefined();
    expect(googleToPlace(raw({ currentOpeningHours: { openNow: false } }))!.openNow).toBe(false);
  });

  it('ignores unspecified price levels and skips entries without id, name or location', () => {
    expect(googleToPlace(raw({ priceLevel: 'PRICE_LEVEL_UNSPECIFIED' }))!.priceLevel).toBeUndefined();
    expect(googleToPlace(raw({ id: undefined }))).toBeNull();
    expect(googleToPlace(raw({ displayName: { text: '  ' } }))).toBeNull();
    expect(googleToPlace(raw({ location: undefined }))).toBeNull();
  });

  it('keeps the photo attribution Google requires', () => {
    const p = googleToPlace(raw({ photos: [{ name: 'places/ChIJabcdefghij/photos/AUc7', authorAttributions: [{ displayName: 'Dana' }] }] }))!;
    expect(p.photoName).toBe('places/ChIJabcdefghij/photos/AUc7');
    expect(p.photoAttribution).toBe('Dana');
  });

  it('merges details into a search result without losing the pin category', () => {
    const base = googleToPlace(raw(), { category: getGoogleCategory('cafe') })!;
    const detailed = googleToPlace(raw({ nationalPhoneNumber: '02 123', types: ['restaurant'] }))!;
    const merged = mergeDetails(base, detailed);
    expect(merged.phone).toBe('02 123');
    expect(merged.category).toBe('cafe');
    expect(merged.rating).toBe(4.6);
  });
});

describe('categories', () => {
  it('has unique ids, non-empty type lists, and is resolvable by id', () => {
    expect(new Set(googleCategories.map((c) => c.id)).size).toBe(googleCategories.length);
    for (const c of googleCategories) {
      expect(c.types.length).toBeGreaterThan(0);
      expect(getGoogleCategory(c.id)).toBe(c);
    }
    expect(getGoogleCategory('casino')).toBeUndefined();
  });

  it('maps Google types to a pin category', () => {
    expect(pinCategoryForTypes(['night_club'])).toBe('party');
    expect(pinCategoryForTypes(['pharmacy'])).toBe('service');
    expect(pinCategoryForTypes(['lodging'])).toBe('sleep');
    expect(pinCategoryForTypes(undefined, 'food')).toBe('food');
  });
});

describe('placeId and Google Maps links', () => {
  it('prefers the link Google returned', () => {
    const p = googleToPlace(raw({ googleMapsUri: 'https://maps.google.com/?cid=1' }))!;
    expect(googleMapsUrl(p)).toBe('https://maps.google.com/?cid=1');
  });

  it('builds the documented place-id URL otherwise, and returns nothing for local places', () => {
    const url = googleMapsUrl(googleToPlace(raw({ displayName: { text: 'A & B' } }))!)!;
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/maps/search/');
    expect(parsed.searchParams.get('api')).toBe('1');
    expect(parsed.searchParams.get('query')).toBe('A & B');
    expect(parsed.searchParams.get('query_place_id')).toBe('ChIJabcdefghij');
    expect(googleMapsUrl(curated[0])).toBeUndefined();
  });
});

describe('duplicates and Google vs local', () => {
  it('drops repeated ids and same-name places within 40 m, but keeps far-apart namesakes', () => {
    const a = googleToPlace(raw())!;
    const dupId = { ...a };
    const nearTwin = googleToPlace(raw({ id: 'ChIJother00000', location: { latitude: 13.75001, longitude: 100.50001 } }))!;
    const farTwin = googleToPlace(raw({ id: 'ChIJfar0000000', location: { latitude: 13.9, longitude: 100.5 } }))!;
    expect(dedupePlaces([a, dupId, nearTwin, farTwin]).map((p) => p.id)).toEqual([a.id, farTwin.id]);
  });

  it('never removes curated places when Google returns a match', () => {
    const local = curated.find((p) => p.id === 'khaosan')!;
    const google = googleToPlace(raw({ displayName: { text: local.name }, location: { latitude: local.lat, longitude: local.lng } }))!;
    const all = [...curated, google];
    expect(all).toContain(local);
    expect(all.filter((p) => p.source === 'google')).toHaveLength(1);
    expect(curated.every((p) => p.source !== 'google')).toBe(true);
  });
});

describe('filters and sorting (local, no refetch)', () => {
  const list = mapGoogleResults([
    raw({ id: 'ChIJaaaaaaaaaa', displayName: { text: 'A' }, rating: 4.8, priceLevel: 'PRICE_LEVEL_INEXPENSIVE', location: { latitude: 13.751, longitude: 100.5 } }),
    raw({ id: 'ChIJbbbbbbbbbb', displayName: { text: 'B' }, rating: 4.1, priceLevel: 'PRICE_LEVEL_EXPENSIVE', currentOpeningHours: { openNow: false }, location: { latitude: 13.77, longitude: 100.5 } }),
    raw({ id: 'ChIJcccccccccc', displayName: { text: 'C' }, rating: undefined, priceLevel: undefined, currentOpeningHours: undefined, location: { latitude: 13.8, longitude: 100.5 } }),
  ]);
  const here = { lat: 13.75, lng: 100.5 };

  it('filters by rating, price, open now and distance, excluding unknowns', () => {
    expect(applyFilters(list, { minRating: 4.5 }).map((p) => p.name)).toEqual(['A']);
    expect(applyFilters(list, { maxPrice: 'moderate' }).map((p) => p.name)).toEqual(['A']);
    expect(applyFilters(list, { openNow: true }).map((p) => p.name)).toEqual(['A']);
    expect(applyFilters(list, { maxDistanceM: 3000 }, here).map((p) => p.name)).toEqual(['A', 'B']);
    expect(applyFilters(list, {})).toHaveLength(3);
  });

  it('sorts by distance or rating without mutating the input', () => {
    const copy = [...list];
    expect(sortPlaces(list, 'distance', here).map((p) => p.name)).toEqual(['A', 'B', 'C']);
    expect(sortPlaces(list, 'rating').map((p) => p.name)).toEqual(['A', 'B', 'C']);
    expect(sortPlaces(list, 'google')).toBe(list);
    expect(list).toEqual(copy);
  });

  it('computes distances and price labels', () => {
    expect(distanceMeters(here, { lat: 13.76, lng: 100.5 })).toBeGreaterThan(1000);
    expect(distanceMeters(here, { lat: 13.76, lng: 100.5 })).toBeLessThan(1200);
    expect(priceSymbols('moderate')).toBe('$$');
    expect(priceSymbols('free')).toBe('חינם');
  });
});

describe('runSearch (status handling)', () => {
  const api = (fetchFn: unknown) => createPlacesApi({ fetchFn: asFetch(fetchFn), isOnline: () => true });
  const nearby = { kind: 'nearby', lat: 13.75, lng: 100.5, radius: 1500, category: 'cafe' } as const;

  it('returns mapped places on success', async () => {
    const out = await runSearch(api(vi.fn(async () => json({ places: [raw()] }))), nearby, () => new Date('2026-01-01T00:00:00Z'));
    expect(out.status).toBe('ok');
    expect(out.places[0]).toMatchObject({ source: 'google', category: 'cafe', sourceUpdatedAt: '2026-01-01T00:00:00.000Z' });
  });

  it('reports an empty result set', async () => {
    expect((await runSearch(api(vi.fn(async () => json({}))), nearby)).status).toBe('empty');
  });

  it.each([
    ['upstream error', json({ error: 'upstream_error' }, 502), 'error'],
    ['proxy without a key', json({ error: 'not_configured' }, 503), 'unavailable'],
    ['rate limited', json({ error: 'rate_limited' }, 429), 'rate_limited'],
    ['404 html from a static host', new Response('<html>Not found</html>', { status: 404 }), 'unavailable'],
    ['200 html from a static host', new Response('<html>ok</html>', { status: 200 }), 'unavailable'],
  ])('maps an API failure (%s)', async (_name, response, status) => {
    const out = await runSearch(api(vi.fn(async () => response.clone())), nearby);
    expect(out).toEqual({ status, places: [] });
  });

  it('falls back to offline without calling the network', async () => {
    const fetchFn = vi.fn();
    const out = await runSearch(createPlacesApi({ fetchFn: asFetch(fetchFn), isOnline: () => false }), nearby);
    expect(out).toEqual({ status: 'offline', places: [] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('treats a dropped connection as offline when the browser is offline, and as an error otherwise', async () => {
    let online = true;
    const failing = vi.fn(async () => {
      online = false;
      throw new TypeError('Failed to fetch');
    });
    expect((await runSearch(createPlacesApi({ fetchFn: asFetch(failing), isOnline: () => online }), nearby)).status).toBe('offline');
    const flaky = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect((await runSearch(createPlacesApi({ fetchFn: asFetch(flaky), isOnline: () => true }), nearby)).status).toBe('error');
  });
});

describe('client cache', () => {
  it('reuses results for the same area, shares in-flight requests, and expires', async () => {
    let t = 0;
    const fetchFn = vi.fn(async () => json({ places: [raw()] }));
    const a = createPlacesApi({ fetchFn: asFetch(fetchFn), now: () => t, isOnline: () => true });
    const req = { lat: 13.75, lng: 100.5, radius: 1500, category: 'food' };

    await Promise.all([a.nearby(req), a.nearby({ ...req, lat: 13.7502 })]); // same ~110 m cell, one shared request
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await a.nearby(req);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    t = 11 * 60_000;
    await a.nearby(req);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await a.nearby({ ...req, category: 'cafe' });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('does not cache failures and never uses localStorage', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem, getItem: () => null });
    let fail = true;
    const fetchFn = vi.fn(async () => (fail ? json({ error: 'x' }, 502) : json({ places: [] })));
    const a = createPlacesApi({ fetchFn: asFetch(fetchFn), isOnline: () => true });
    const req = { lat: 1, lng: 1, radius: 1000, category: 'food' };
    await expect(a.nearby(req)).rejects.toBeInstanceOf(PlacesError);
    fail = false;
    await expect(a.nearby(req)).resolves.toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('sends the session token to details, and parses autocomplete suggestions', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('autocomplete')
        ? json({ suggestions: [{ placePrediction: { placeId: 'ChIJabcdefghij', structuredFormat: { mainText: { text: 'Khao San Road' }, secondaryText: { text: 'Bangkok' } } } }, { queryPrediction: {} }] })
        : json(raw()),
    );
    const a = createPlacesApi({ fetchFn: asFetch(fetchFn), isOnline: () => true });
    const token = newSessionToken();
    expect(await a.autocomplete('khao', token, { lat: 13.7, lng: 100.5 })).toEqual([{ placeId: 'ChIJabcdefghij', main: 'Khao San Road', secondary: 'Bangkok' }]);
    await a.details('ChIJabcdefghij', token);
    expect(String(fetchFn.mock.calls[1][0])).toContain(`sessionToken=${token}`);
    // Autocomplete requests are not cached, so two calls hit the network twice.
    await a.autocomplete('khao', token);
    expect(fetchFn.mock.calls.filter(([u]) => String(u).includes('autocomplete'))).toHaveLength(2);
  });

  it('generates session tokens the server accepts', () => {
    const t = newSessionToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(newSessionToken()).not.toBe(t);
  });
});

describe('debounce', () => {
  afterEach(() => vi.useRealTimers());

  it('collapses rapid calls into one trailing call and supports cancel', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d('a');
    d('b');
    d('c');
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
    d('x');
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
