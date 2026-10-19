import type { GooglePlaceRaw } from './mapping';

export type PlacesErrorKind = 'unavailable' | 'offline' | 'rate_limited' | 'server';

export class PlacesError extends Error {
  constructor(public kind: PlacesErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'PlacesError';
  }
}

export interface NearbyParams {
  lat: number;
  lng: number;
  radius: number;
  category: string;
  rank?: 'popularity' | 'distance';
}

export interface SearchParams {
  query: string;
  lat?: number;
  lng?: number;
  radius?: number;
  category?: string;
  openNow?: boolean;
}

export interface Suggestion {
  placeId: string;
  main: string;
  secondary?: string;
}

interface Options {
  base?: string;
  fetchFn?: typeof fetch;
  now?: () => number;
  isOnline?: () => boolean;
}

const SEARCH_TTL = 10 * 60_000;
const DETAILS_TTL = 30 * 60_000;
const PHOTO_TTL = 5 * 60_000;

/**
 * Client for our own /api/places proxy (never for Google directly – the key lives on the server).
 *
 * Caching is in memory only and short-lived: Google's terms limit how long place content may be
 * stored, so nothing here is written to localStorage. Identical in-flight requests are shared.
 */
export function createPlacesApi(options: Options = {}) {
  const base = options.base ?? import.meta.env?.VITE_PLACES_API_BASE ?? '';
  const now = options.now ?? Date.now;
  const isOnline = options.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const cache = new Map<string, { value: unknown; expires: number }>();
  const inflight = new Map<string, Promise<unknown>>();

  const doFetch = (input: string, init?: RequestInit) => (options.fetchFn ?? fetch)(input, init);

  async function request<T>(path: string, init: RequestInit | undefined, cacheKey: string | null, ttl: number): Promise<T> {
    if (cacheKey) {
      const hit = cache.get(cacheKey);
      if (hit && hit.expires > now()) return hit.value as T;
      const pending = inflight.get(cacheKey);
      if (pending) return pending as Promise<T>;
    }
    if (!isOnline()) throw new PlacesError('offline');

    const run = (async () => {
      let res: Response;
      try {
        res = await doFetch(`${base}/api/places/${path}`, init);
      } catch {
        throw new PlacesError(isOnline() ? 'server' : 'offline');
      }
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        // A static host answers unknown routes with HTML: the proxy isn't deployed here.
        throw new PlacesError('unavailable');
      }
      if (!res.ok) {
        const code = (data as { error?: string })?.error;
        if (res.status === 503 || res.status === 404 || code === 'not_configured') throw new PlacesError('unavailable');
        if (res.status === 429) throw new PlacesError('rate_limited');
        throw new PlacesError('server');
      }
      if (cacheKey) cache.set(cacheKey, { value: data, expires: now() + ttl });
      return data as T;
    })();

    if (cacheKey) {
      inflight.set(cacheKey, run);
      run.then(
        () => inflight.delete(cacheKey),
        () => inflight.delete(cacheKey),
      );
    }
    return run;
  }

  const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const r3 = (n: number) => Math.round(n * 1000) / 1000;

  return {
    async nearby(p: NearbyParams): Promise<GooglePlaceRaw[]> {
      const key = `nearby|${r3(p.lat)}|${r3(p.lng)}|${Math.round(p.radius / 100)}|${p.category}|${p.rank ?? 'popularity'}`;
      const data = await request<{ places?: GooglePlaceRaw[] }>('nearby', post(p), key, SEARCH_TTL);
      return data.places ?? [];
    },

    async search(p: SearchParams): Promise<GooglePlaceRaw[]> {
      const key = `search|${p.query.toLowerCase()}|${p.lat !== undefined ? `${r3(p.lat)}|${r3(p.lng ?? 0)}|${Math.round((p.radius ?? 0) / 100)}` : '-'}|${p.category ?? '-'}|${p.openNow ?? false}`;
      const data = await request<{ places?: GooglePlaceRaw[] }>('search', post(p), key, SEARCH_TTL);
      return data.places ?? [];
    },

    details(id: string, sessionToken?: string): Promise<GooglePlaceRaw> {
      const qs = new URLSearchParams({ id, ...(sessionToken ? { sessionToken } : {}) });
      return request<GooglePlaceRaw>(`details?${qs}`, undefined, `details|${id}`, DETAILS_TTL);
    },

    async autocomplete(input: string, sessionToken: string, near?: { lat: number; lng: number }): Promise<Suggestion[]> {
      // Not cached: the session token links these keystrokes to the details call that ends the session.
      const data = await request<{ suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }[] }>(
        'autocomplete',
        post({ input, sessionToken, ...near }),
        null,
        0,
      );
      return (data.suggestions ?? []).flatMap((s) => {
        const pp = s.placePrediction;
        const main = pp?.structuredFormat?.mainText?.text ?? pp?.text?.text;
        return pp?.placeId && main ? [{ placeId: pp.placeId, main, secondary: pp.structuredFormat?.secondaryText?.text }] : [];
      });
    },

    async photo(name: string, width = 400): Promise<string | undefined> {
      const qs = new URLSearchParams({ name, w: String(width) });
      const data = await request<{ photoUri?: string }>(`photo?${qs}`, undefined, `photo|${name}|${width}`, PHOTO_TTL);
      return data.photoUri;
    },

    clearCache() {
      cache.clear();
    },
  };
}

export type PlacesApi = ReturnType<typeof createPlacesApi>;

/** App-wide instance. */
export const placesApi: PlacesApi = createPlacesApi();

/** A fresh random id for one autocomplete → details billing session. */
export function newSessionToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
