import type { Place, PriceLevel } from '../data/places';
import { pinCategoryForTypes, type GoogleCategory } from './categories';

/** The subset of a Places API (New) place that the proxy's field masks return. */
export interface GooglePlaceRaw {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  primaryType?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  currentOpeningHours?: { openNow?: boolean };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  photos?: { name?: string; authorAttributions?: { displayName?: string }[] }[];
}

const PRICE: Record<string, PriceLevel> = {
  PRICE_LEVEL_FREE: 'free',
  PRICE_LEVEL_INEXPENSIVE: 'inexpensive',
  PRICE_LEVEL_MODERATE: 'moderate',
  PRICE_LEVEL_EXPENSIVE: 'expensive',
  PRICE_LEVEL_VERY_EXPENSIVE: 'very_expensive',
};

export const priceOrder: PriceLevel[] = ['free', 'inexpensive', 'moderate', 'expensive', 'very_expensive'];

export function priceSymbols(level: PriceLevel): string {
  return level === 'free' ? 'חינם' : '$'.repeat(priceOrder.indexOf(level));
}

export const isGooglePlace = (p: Place) => p.source === 'google';

/**
 * Converts a Google place into the app's Place model. Anything Google did not return stays
 * undefined – nothing is guessed. Returns null if the essentials (id, name, location) are missing.
 */
export function googleToPlace(raw: GooglePlaceRaw, opts: { category?: GoogleCategory; fetchedAt?: string } = {}): Place | null {
  const name = raw.displayName?.text?.trim();
  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;
  if (!raw.id || !name || typeof lat !== 'number' || typeof lng !== 'number') return null;

  const photo = raw.photos?.[0];
  return {
    id: `g:${raw.id}`,
    source: 'google',
    googlePlaceId: raw.id,
    // Google places are not tied to one of the app's country records.
    countryId: '',
    name,
    category: opts.category?.pin ?? pinCategoryForTypes(raw.types),
    lat,
    lng,
    desc: '',
    address: raw.formattedAddress,
    googleTypes: raw.types,
    rating: typeof raw.rating === 'number' ? raw.rating : undefined,
    userRatingCount: typeof raw.userRatingCount === 'number' ? raw.userRatingCount : undefined,
    priceLevel: raw.priceLevel ? PRICE[raw.priceLevel] : undefined,
    openNow: typeof raw.currentOpeningHours?.openNow === 'boolean' ? raw.currentOpeningHours.openNow : undefined,
    openingHours: raw.regularOpeningHours?.weekdayDescriptions,
    phone: raw.nationalPhoneNumber,
    website: raw.websiteUri,
    googleMapsUri: raw.googleMapsUri,
    photoName: photo?.name,
    photoAttribution: photo?.authorAttributions?.[0]?.displayName,
    sourceUpdatedAt: opts.fetchedAt,
  };
}

/** Merges richer details into a place from a search result, keeping what search already had. */
export function mergeDetails(base: Place, detailed: Place): Place {
  const defined = Object.fromEntries(Object.entries(detailed).filter(([, v]) => v !== undefined));
  return { ...base, ...defined, category: base.category };
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const normalizeName = (n: string) => n.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Drops repeated Google ids and near-identical entries (same name within 40 m). Order is preserved. */
export function dedupePlaces(places: Place[]): Place[] {
  const seenIds = new Set<string>();
  const kept: Place[] = [];
  for (const p of places) {
    if (seenIds.has(p.id)) continue;
    const twin = kept.find((k) => normalizeName(k.name) === normalizeName(p.name) && distanceMeters(k, p) < 40);
    if (twin) continue;
    seenIds.add(p.id);
    kept.push(p);
  }
  return kept;
}

export function mapGoogleResults(raw: GooglePlaceRaw[] | undefined, opts: { category?: GoogleCategory; fetchedAt?: string } = {}): Place[] {
  return dedupePlaces((raw ?? []).flatMap((r) => googleToPlace(r, opts) ?? []));
}

/** Official "open in Google Maps" URL. Prefers the link Google returned; otherwise builds the documented place-id form. */
export function googleMapsUrl(place: Place): string | undefined {
  if (place.googleMapsUri) return place.googleMapsUri;
  if (!place.googlePlaceId) return undefined;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${encodeURIComponent(place.googlePlaceId)}`;
}

/* ─── Filters & sorting (applied locally – changing them never triggers a new Google request) ─── */

export interface PlaceFilters {
  minRating?: number;
  maxPrice?: PriceLevel;
  openNow?: boolean;
  maxDistanceM?: number;
}

export type SortMode = 'google' | 'distance' | 'rating';

/**
 * Active filters exclude places where Google gave no value for that field – we never assume
 * a place is open, cheap or well rated.
 */
export function applyFilters(places: Place[], filters: PlaceFilters, from?: { lat: number; lng: number }): Place[] {
  return places.filter((p) => {
    if (filters.minRating !== undefined && (p.rating === undefined || p.rating < filters.minRating)) return false;
    if (filters.maxPrice !== undefined && (p.priceLevel === undefined || priceOrder.indexOf(p.priceLevel) > priceOrder.indexOf(filters.maxPrice))) return false;
    if (filters.openNow && p.openNow !== true) return false;
    if (filters.maxDistanceM !== undefined && from && distanceMeters(from, p) > filters.maxDistanceM) return false;
    return true;
  });
}

export function sortPlaces(places: Place[], mode: SortMode, from?: { lat: number; lng: number }): Place[] {
  if (mode === 'google') return places;
  const copy = [...places];
  if (mode === 'distance' && from) return copy.sort((a, b) => distanceMeters(from, a) - distanceMeters(from, b));
  if (mode === 'rating') {
    return copy.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0));
  }
  return copy;
}
