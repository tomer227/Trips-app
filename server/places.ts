/**
 * Secure proxy for Google Places API (New).
 *
 * - The API key exists only here (server env GOOGLE_MAPS_API_KEY); it is never returned or logged.
 * - Every upstream request has an explicit, fixed Field Mask. The client cannot widen it.
 * - Inputs are validated and clamped; category ids map to includedTypes on the server.
 * - Responses are cached in memory (short TTL) and per-IP rate limited.
 *
 * Framework-free on purpose: Vercel, Netlify and the Vite dev server all call handlePlacesRequest.
 */
import { getGoogleCategory } from '../src/places/categories';

export interface ProxyRequest {
  action: string;
  method: string;
  query: Record<string, string | undefined>;
  body: unknown;
  ip?: string;
  origin?: string;
}

export interface ProxyResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface ProxyDeps {
  apiKey?: string;
  fetchFn?: typeof fetch;
  now?: () => number;
  cache?: TtlCache;
  limiter?: RateLimiter;
  /** Comma-separated origins allowed to call the API (empty = any) */
  allowedOrigins?: string;
  log?: (message: string) => void;
}

const BASE = 'https://places.googleapis.com/v1';

/** Explicit Field Masks – never "*". Expensive fields (photos) are requested for details only. */
export const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.formattedAddress',
  'places.primaryType',
  'places.types',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  // Lets the client honour the "open now" filter without guessing. Absent when Google has no data.
  'places.currentOpeningHours.openNow',
].join(',');

export const DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'location',
  'formattedAddress',
  'primaryType',
  'types',
  'rating',
  'userRatingCount',
  'priceLevel',
  'regularOpeningHours.weekdayDescriptions',
  'currentOpeningHours.openNow',
  'nationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
  'photos.name',
].join(',');

const SEARCH_TTL = 30 * 60_000;
const DETAILS_TTL = 60 * 60_000;
const PHOTO_TTL = 10 * 60_000;

export class TtlCache {
  private items = new Map<string, { value: unknown; expires: number }>();
  constructor(private maxEntries = 500) {}

  get<T>(key: string, now: number): T | undefined {
    const hit = this.items.get(key);
    if (!hit) return undefined;
    if (hit.expires <= now) {
      this.items.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set(key: string, value: unknown, ttlMs: number, now: number) {
    if (this.items.size >= this.maxEntries) {
      // Drop the oldest entry (Map keeps insertion order).
      const oldest = this.items.keys().next().value;
      if (oldest !== undefined) this.items.delete(oldest);
    }
    this.items.set(key, { value, expires: now + ttlMs });
  }

  get size() {
    return this.items.size;
  }
}

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private max = 90, private windowMs = 60_000) {}

  allow(key: string, now: number): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size > 5000) this.hits.clear();
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.max;
  }
}

const sharedCache = new TtlCache();
const sharedLimiter = new RateLimiter();

const fail = (status: number, error: string, extra: Record<string, unknown> = {}): ProxyResponse => ({ status, body: { error, ...extra } });

const PLACE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const SESSION_TOKEN = /^[A-Za-z0-9_-]{8,64}$/;

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const lang = (v: unknown) => (v === 'en' ? 'en' : 'he');

interface Point {
  lat: number;
  lng: number;
}

function point(body: Record<string, unknown>): Point | undefined {
  const lat = num(body.lat);
  const lng = num(body.lng);
  if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { lat, lng };
}

const circle = (p: Point, radius: number) => ({ circle: { center: { latitude: p.lat, longitude: p.lng }, radius } });
// ~110 m grid: nearby users share cache entries.
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export async function handlePlacesRequest(req: ProxyRequest, deps: ProxyDeps): Promise<ProxyResponse> {
  const now = (deps.now ?? Date.now)();
  const fetchFn = deps.fetchFn ?? fetch;
  const cache = deps.cache ?? sharedCache;
  const limiter = deps.limiter ?? sharedLimiter;

  const allowed = (deps.allowedOrigins ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (allowed.length && req.origin && !allowed.includes(req.origin)) return fail(403, 'forbidden_origin');
  if (!limiter.allow(req.ip ?? 'unknown', now)) return fail(429, 'rate_limited');
  if (!deps.apiKey) return fail(503, 'not_configured');

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const key = deps.apiKey;

  /** One place for all upstream calls, so the key and error handling live in one spot. */
  const upstream = async (path: string, init: { method: 'GET' | 'POST'; fieldMask?: string; body?: unknown }): Promise<ProxyResponse & { ok: boolean }> => {
    try {
      const res = await fetchFn(`${BASE}${path}`, {
        method: init.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          ...(init.fieldMask ? { 'X-Goog-FieldMask': init.fieldMask } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      if (!res.ok) {
        // Upstream error bodies are logged only by status – never forwarded to the client.
        deps.log?.(`places upstream ${res.status} for ${path.split('?')[0]}`);
        if (res.status === 429) return { ok: false, ...fail(429, 'upstream_rate_limited') };
        return { ok: false, ...fail(502, 'upstream_error', { upstreamStatus: res.status }) };
      }
      return { ok: true, status: 200, body: await res.json() };
    } catch {
      deps.log?.('places upstream network failure');
      return { ok: false, ...fail(502, 'network_error') };
    }
  };

  const cached = async (cacheKey: string, ttl: number, run: () => Promise<ProxyResponse & { ok: boolean }>): Promise<ProxyResponse> => {
    const hit = cache.get<unknown>(cacheKey, now);
    if (hit !== undefined) return { status: 200, body: hit, headers: { 'X-Cache': 'HIT' } };
    const res = await run();
    if (res.ok) cache.set(cacheKey, res.body, ttl, now);
    return { status: res.status, body: res.body, headers: res.ok ? { 'X-Cache': 'MISS' } : undefined };
  };

  switch (req.action) {
    case 'nearby': {
      if (req.method !== 'POST') return fail(405, 'method_not_allowed');
      const p = point(body);
      const category = getGoogleCategory(String(body.category ?? ''));
      if (!p || !category) return fail(400, 'invalid_request');
      const radius = clamp(round100(num(body.radius) ?? 2000), 100, 50_000);
      const rank = body.rank === 'distance' ? 'DISTANCE' : 'POPULARITY';
      const language = lang(body.lang);
      const cacheKey = `nearby|${round3(p.lat)}|${round3(p.lng)}|${radius}|${category.id}|${rank}|${language}`;
      return cached(cacheKey, SEARCH_TTL, () =>
        upstream('/places:searchNearby', {
          method: 'POST',
          fieldMask: SEARCH_FIELD_MASK,
          body: {
            includedTypes: category.types,
            maxResultCount: clamp(num(body.maxResults) ?? 20, 1, 20),
            rankPreference: rank,
            languageCode: language,
            locationRestriction: circle({ lat: round3(p.lat), lng: round3(p.lng) }, radius),
          },
        }),
      );
    }

    case 'search': {
      if (req.method !== 'POST') return fail(405, 'method_not_allowed');
      const query = str(body.query, 200);
      if (!query) return fail(400, 'invalid_request');
      const p = point(body);
      const category = body.category ? getGoogleCategory(String(body.category)) : undefined;
      const radius = clamp(round100(num(body.radius) ?? 20_000), 100, 50_000);
      const language = lang(body.lang);
      const openNow = body.openNow === true;
      const cacheKey = `search|${query.toLowerCase()}|${p ? `${round3(p.lat)}|${round3(p.lng)}|${radius}` : 'nolocation'}|${category?.id ?? '-'}|${openNow}|${language}`;
      return cached(cacheKey, SEARCH_TTL, () =>
        upstream('/places:searchText', {
          method: 'POST',
          fieldMask: SEARCH_FIELD_MASK,
          body: {
            textQuery: query,
            pageSize: 20,
            languageCode: language,
            ...(p ? { locationBias: circle({ lat: round3(p.lat), lng: round3(p.lng) }, radius) } : {}),
            ...(category ? { includedType: category.types[0], strictTypeFiltering: false } : {}),
            ...(openNow ? { openNow: true } : {}),
          },
        }),
      );
    }

    case 'details': {
      if (req.method !== 'GET') return fail(405, 'method_not_allowed');
      const id = req.query.id;
      if (!id || !PLACE_ID.test(id)) return fail(400, 'invalid_request');
      const language = lang(req.query.lang);
      const token = req.query.sessionToken && SESSION_TOKEN.test(req.query.sessionToken) ? req.query.sessionToken : undefined;
      const res = await cached(`details|${id}|${language}`, DETAILS_TTL, () =>
        upstream(`/places/${id}?languageCode=${language}${token ? `&sessionToken=${token}` : ''}`, { method: 'GET', fieldMask: DETAILS_FIELD_MASK }),
      );
      return res.status === 200 ? { ...res, headers: { ...res.headers, 'Cache-Control': 'private, max-age=600' } } : res;
    }

    case 'autocomplete': {
      if (req.method !== 'POST') return fail(405, 'method_not_allowed');
      const input = str(body.input, 200);
      const token = typeof body.sessionToken === 'string' && SESSION_TOKEN.test(body.sessionToken) ? body.sessionToken : undefined;
      if (!input || !token) return fail(400, 'invalid_request');
      const p = point(body);
      const radius = clamp(round100(num(body.radius) ?? 30_000), 100, 50_000);
      // Not cached: the session token ties the keystrokes to the follow-up details call for billing.
      const res = await upstream('/places:autocomplete', {
        method: 'POST',
        body: { input, sessionToken: token, languageCode: lang(body.lang), ...(p ? { locationBias: circle({ lat: round3(p.lat), lng: round3(p.lng) }, radius) } : {}) },
      });
      return { status: res.status, body: res.body };
    }

    case 'photo': {
      if (req.method !== 'GET') return fail(405, 'method_not_allowed');
      const name = req.query.name;
      if (!name || !PHOTO_NAME.test(name)) return fail(400, 'invalid_request');
      const width = clamp(num(req.query.w) ?? 400, 100, 800);
      // skipHttpRedirect returns the image URL as JSON so the key never reaches the browser.
      return cached(`photo|${name}|${width}`, PHOTO_TTL, () => upstream(`/${name}/media?maxWidthPx=${Math.round(width)}&skipHttpRedirect=true`, { method: 'GET' }));
    }

    default:
      return fail(404, 'unknown_action');
  }
}

function round100(n: number): number {
  return Math.round(n / 100) * 100;
}
