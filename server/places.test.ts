import { describe, expect, it, vi } from 'vitest';
import { DETAILS_FIELD_MASK, RateLimiter, SEARCH_FIELD_MASK, TtlCache, handlePlacesRequest, type ProxyDeps, type ProxyRequest } from './places';

const KEY = 'SECRET-KEY-123';
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function setup(response: () => Response | Promise<Response> = () => ok({ places: [] })) {
  const fetchFn = vi.fn(async () => response());
  const deps: ProxyDeps = { apiKey: KEY, fetchFn: fetchFn as unknown as typeof fetch, cache: new TtlCache(), limiter: new RateLimiter(1000), now: () => 1_000_000 };
  const call = (req: Partial<ProxyRequest> & { action: string }) => handlePlacesRequest({ method: 'POST', query: {}, body: undefined, ...req }, deps);
  return { fetchFn, deps, call };
}

const nearbyBody = { lat: 13.7563, lng: 100.5018, radius: 1500, category: 'food' };
const calledInit = (fetchFn: ReturnType<typeof vi.fn>, n = 0) => (fetchFn.mock.calls[n] as unknown as [string, RequestInit])[1];
const calledUrl = (fetchFn: ReturnType<typeof vi.fn>, n = 0) => (fetchFn.mock.calls[n] as unknown as [string, RequestInit])[0];

describe('places proxy – security', () => {
  it('refuses to run without a server key and never calls Google', async () => {
    const { fetchFn, deps } = setup();
    const res = await handlePlacesRequest({ action: 'nearby', method: 'POST', query: {}, body: nearbyBody }, { ...deps, apiKey: undefined });
    expect(res.status).toBe(503);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sends the key only to Google as a header and never returns it', async () => {
    const { fetchFn, call } = setup(() => ok({ places: [{ id: 'x' }] }));
    const res = await call({ action: 'nearby', body: nearbyBody });
    expect(calledUrl(fetchFn)).toBe('https://places.googleapis.com/v1/places:searchNearby');
    expect((calledInit(fetchFn).headers as Record<string, string>)['X-Goog-Api-Key']).toBe(KEY);
    expect(JSON.stringify(res)).not.toContain(KEY);
  });

  it('does not leak upstream error details or the key on failures', async () => {
    const { call } = setup(() => new Response(JSON.stringify({ error: { message: `bad key ${KEY}` } }), { status: 403 }));
    const res = await call({ action: 'nearby', body: nearbyBody });
    expect(res.status).toBe(502);
    expect(JSON.stringify(res)).not.toContain(KEY);
  });

  it('maps network failures to a clean 502', async () => {
    const { call } = setup(() => {
      throw new Error('boom');
    });
    expect((await call({ action: 'nearby', body: nearbyBody })).status).toBe(502);
  });

  it('rejects disallowed origins and rate-limits by IP', async () => {
    const { deps } = setup();
    const blocked = await handlePlacesRequest({ action: 'nearby', method: 'POST', query: {}, body: nearbyBody, origin: 'https://evil.example' }, { ...deps, allowedOrigins: 'https://app.example' });
    expect(blocked.status).toBe(403);

    const limiter = new RateLimiter(2, 60_000);
    const req: ProxyRequest = { action: 'nearby', method: 'POST', query: {}, body: nearbyBody, ip: '1.1.1.1' };
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await handlePlacesRequest(req, { ...deps, limiter, cache: new TtlCache() })).status);
    expect(statuses).toEqual([200, 200, 429]);
  });
});

describe('places proxy – field masks and validation', () => {
  it('always sends a fixed, explicit field mask (never "*")', async () => {
    const { fetchFn, call } = setup(() => ok({}));
    await call({ action: 'nearby', body: nearbyBody });
    await call({ action: 'search', body: { query: 'vegan restaurant' } });
    await call({ action: 'details', method: 'GET', query: { id: 'ChIJN1t_tDeuEmsRUsoyG83frY4' } });
    const masks = fetchFn.mock.calls.map((_, i) => (calledInit(fetchFn, i).headers as Record<string, string>)['X-Goog-FieldMask']);
    expect(masks).toEqual([SEARCH_FIELD_MASK, SEARCH_FIELD_MASK, DETAILS_FIELD_MASK]);
    for (const m of masks) expect(m).not.toContain('*');
    // Heavy fields are details-only.
    expect(SEARCH_FIELD_MASK).not.toMatch(/photos|reviews|generativeSummary/);
    expect(DETAILS_FIELD_MASK).not.toMatch(/reviews|generativeSummary/);
  });

  it('builds Nearby requests from a server-side category map and clamps the radius', async () => {
    const { fetchFn, call } = setup();
    await call({ action: 'nearby', body: { ...nearbyBody, category: 'lodging', radius: 999999, maxResults: 500 } });
    const sent = JSON.parse(calledInit(fetchFn).body as string);
    expect(sent.includedTypes).toEqual(['hostel', 'hotel', 'guest_house', 'bed_and_breakfast']);
    expect(sent.locationRestriction.circle.radius).toBe(50000);
    expect(sent.maxResultCount).toBe(20);
    expect(sent.languageCode).toBe('he');
  });

  it.each([
    ['unknown category', { action: 'nearby', body: { ...nearbyBody, category: 'casino' } }],
    ['latitude out of range', { action: 'nearby', body: { ...nearbyBody, lat: 123 } }],
    ['missing coordinates', { action: 'nearby', body: { category: 'food' } }],
    ['empty search', { action: 'search', body: { query: '   ' } }],
    ['bad place id', { action: 'details', method: 'GET', query: { id: '../../etc' } }],
    ['bad photo name', { action: 'photo', method: 'GET', query: { name: 'places/a/../b' } }],
    ['autocomplete without session token', { action: 'autocomplete', body: { input: 'bang' } }],
  ])('rejects invalid input: %s', async (_name, req) => {
    const { fetchFn, call } = setup();
    expect((await call(req as ProxyRequest)).status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects wrong HTTP methods and unknown actions', async () => {
    const { call } = setup();
    expect((await call({ action: 'nearby', method: 'GET' })).status).toBe(405);
    expect((await call({ action: 'nope' })).status).toBe(404);
  });

  it('passes the session token to details and autocomplete for correct billing', async () => {
    const { fetchFn, call } = setup(() => ok({}));
    const token = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
    await call({ action: 'autocomplete', body: { input: 'khao san', sessionToken: token, lat: 13.75, lng: 100.5 } });
    expect(JSON.parse(calledInit(fetchFn, 0).body as string)).toMatchObject({ input: 'khao san', sessionToken: token });
    await call({ action: 'details', method: 'GET', query: { id: 'ChIJN1t_tDeuEmsRUsoyG83frY4', sessionToken: token } });
    expect(calledUrl(fetchFn, 1)).toContain(`sessionToken=${token}`);
  });

  it('returns the photo URL as JSON so the key never reaches the browser', async () => {
    const { fetchFn, call } = setup(() => ok({ photoUri: 'https://lh3.googleusercontent.com/x' }));
    const res = await call({ action: 'photo', method: 'GET', query: { name: 'places/ChIJabc/photos/AUc7', w: '9999' } });
    expect(calledUrl(fetchFn)).toContain('maxWidthPx=800');
    expect(calledUrl(fetchFn)).toContain('skipHttpRedirect=true');
    expect(res.body).toEqual({ photoUri: 'https://lh3.googleusercontent.com/x' });
  });
});

describe('places proxy – cache', () => {
  it('serves repeated searches for nearby spots from cache', async () => {
    const { fetchFn, call } = setup(() => ok({ places: [{ id: 'a' }] }));
    const a = await call({ action: 'nearby', body: nearbyBody });
    // Same ~110 m cell and rounded radius → same cache entry.
    const b = await call({ action: 'nearby', body: { ...nearbyBody, lat: 13.7561, lng: 100.5019, radius: 1520 } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(a.headers?.['X-Cache']).toBe('MISS');
    expect(b.headers?.['X-Cache']).toBe('HIT');
    expect(b.body).toEqual(a.body);
  });

  it('does not share cache across categories, and does not cache errors', async () => {
    const { fetchFn, call } = setup(() => new Response('{}', { status: 500 }));
    await call({ action: 'nearby', body: nearbyBody });
    await call({ action: 'nearby', body: nearbyBody });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await call({ action: 'nearby', body: { ...nearbyBody, category: 'cafe' } });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('expires entries after the TTL', async () => {
    const cache = new TtlCache();
    cache.set('k', 1, 1000, 0);
    expect(cache.get('k', 999)).toBe(1);
    expect(cache.get('k', 1000)).toBeUndefined();
  });

  it('stays bounded', () => {
    const cache = new TtlCache(3);
    for (let i = 0; i < 10; i++) cache.set(`k${i}`, i, 1000, 0);
    expect(cache.size).toBe(3);
    expect(cache.get('k9', 1)).toBe(9);
    expect(cache.get('k0', 1)).toBeUndefined();
  });
});
