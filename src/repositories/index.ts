import type { TripPlan } from '../budget';
import { emptyPlan } from '../budget';
import type { Place } from '../data/places';
import type { CheckIn, Community, Review } from '../community';
import { emptyCommunity } from '../community';
import { notifyStorageChange } from '../storage';

/**
 * Persistence boundary. The UI talks to these interfaces so the storage behind them can move from
 * localStorage to a shared backend (Supabase/Firebase) without touching components.
 */
export interface PlaceRepository {
  listCustom(): Place[];
  addCustom(place: Place): boolean;
  removeCustom(id: string): boolean;
  listSavedIds(): string[];
  setSaved(id: string, saved: boolean): boolean;
}

export interface ReviewRepository {
  list(placeId?: string): Review[];
  add(review: Review): boolean;
  remove(id: string): boolean;
}

export interface CheckinRepository {
  get(): CheckIn | null;
  set(checkIn: CheckIn | null): boolean;
}

export interface TripRepository {
  load(): TripPlan;
  save(plan: TripPlan): boolean;
}

const COMMUNITY_KEY = 'community';
const TRIP_KEY = 'trip-plan';

export function readCommunity(): Community {
  try {
    const raw = localStorage.getItem(COMMUNITY_KEY);
    return raw ? { ...emptyCommunity, ...JSON.parse(raw) } : emptyCommunity;
  } catch {
    return emptyCommunity;
  }
}

/** Returns false when the write failed (e.g. storage full because of photos). */
export function writeCommunity(value: Community): boolean {
  try {
    const next = JSON.stringify(value);
    const changed = localStorage.getItem(COMMUNITY_KEY) !== next;
    localStorage.setItem(COMMUNITY_KEY, next);
    if (changed) notifyStorageChange(COMMUNITY_KEY);
    return true;
  } catch {
    return false;
  }
}

function mutate(fn: (c: Community) => Community): boolean {
  return writeCommunity(fn(readCommunity()));
}

export const placeRepository: PlaceRepository = {
  listCustom: () => readCommunity().customPlaces,
  addCustom: (place) => mutate((c) => ({ ...c, customPlaces: [...c.customPlaces, place] })),
  removeCustom: (id) => mutate((c) => ({ ...c, customPlaces: c.customPlaces.filter((p) => p.id !== id) })),
  listSavedIds: () => readCommunity().saved,
  setSaved: (id, saved) =>
    mutate((c) => ({ ...c, saved: saved ? [...new Set([...c.saved, id])] : c.saved.filter((s) => s !== id) })),
};

export const reviewRepository: ReviewRepository = {
  list: (placeId) => readCommunity().reviews.filter((r) => !placeId || r.placeId === placeId),
  add: (review) => mutate((c) => ({ ...c, reviews: [...c.reviews, review] })),
  remove: (id) => mutate((c) => ({ ...c, reviews: c.reviews.filter((r) => r.id !== id) })),
};

export const checkinRepository: CheckinRepository = {
  get: () => readCommunity().checkIn,
  set: (checkIn) => mutate((c) => ({ ...c, checkIn })),
};

export const tripRepository: TripRepository = {
  load() {
    try {
      const raw = localStorage.getItem(TRIP_KEY);
      return raw ? { ...emptyPlan, ...JSON.parse(raw) } : emptyPlan;
    } catch {
      return emptyPlan;
    }
  },
  save(plan) {
    try {
      localStorage.setItem(TRIP_KEY, JSON.stringify(plan));
      return true;
    } catch {
      return false;
    }
  },
};
