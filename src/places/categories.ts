import type { PlaceCategory } from '../data/places';

/**
 * Search categories shown as chips. `types` are Google Places (New) "Table A" types used as
 * includedTypes on the server – the client only ever sends the category id, never raw types.
 */
export type GoogleCategoryId = 'food' | 'cafe' | 'lodging' | 'beach' | 'nature' | 'nightlife' | 'supermarket' | 'pharmacy' | 'fuel' | 'car' | 'attraction';

export interface GoogleCategory {
  id: GoogleCategoryId;
  label: string;
  emoji: string;
  types: string[];
  /** How results are drawn on the map */
  pin: PlaceCategory;
}

export const googleCategories: GoogleCategory[] = [
  { id: 'food', label: 'אוכל', emoji: '🍜', types: ['restaurant'], pin: 'food' },
  { id: 'cafe', label: 'קפה', emoji: '☕', types: ['cafe', 'coffee_shop'], pin: 'cafe' },
  { id: 'lodging', label: 'לינה', emoji: '🏨', types: ['hostel', 'hotel', 'guest_house', 'bed_and_breakfast'], pin: 'sleep' },
  { id: 'beach', label: 'חופים', emoji: '🏝️', types: ['beach'], pin: 'attraction' },
  { id: 'nature', label: 'טבע', emoji: '🥾', types: ['national_park', 'hiking_area', 'park'], pin: 'attraction' },
  { id: 'nightlife', label: 'חיי לילה', emoji: '🎉', types: ['bar', 'night_club'], pin: 'party' },
  { id: 'attraction', label: 'אטרקציות', emoji: '🏞️', types: ['tourist_attraction'], pin: 'attraction' },
  { id: 'supermarket', label: 'סופר', emoji: '🛒', types: ['supermarket', 'grocery_store'], pin: 'service' },
  { id: 'pharmacy', label: 'בית מרקחת', emoji: '💊', types: ['pharmacy'], pin: 'service' },
  { id: 'fuel', label: 'דלק', emoji: '⛽', types: ['gas_station'], pin: 'service' },
  { id: 'car', label: 'רכב', emoji: '🚗', types: ['car_rental'], pin: 'service' },
];

export function getGoogleCategory(id: string): GoogleCategory | undefined {
  return googleCategories.find((c) => c.id === id);
}

/** Best-effort pin category for a place whose search category is unknown (text search / details). */
export function pinCategoryForTypes(types: string[] | undefined, fallback: PlaceCategory = 'attraction'): PlaceCategory {
  if (!types) return fallback;
  for (const c of googleCategories) if (c.types.some((t) => types.includes(t))) return c.pin;
  if (types.includes('lodging')) return 'sleep';
  return fallback;
}
