import { useCallback, useState } from 'react';
import { countries } from './data/countries';
import { isInSeason, places as curatedPlaces, type IsraeliLevel, type Place } from './data/places';
import type { RegionId } from './data/types';

/**
 * Community layer: reviews, user-added places, "I'm here" check-ins and saved places.
 *
 * Today everything lives on the device (localStorage). The shape is intentionally
 * server-friendly so a shared backend can replace `load`/`persist` later without
 * touching the UI.
 */

export type ReviewTag = 'safe-alone' | 'unsafe' | 'israelis' | 'packed' | 'no-israelis' | 'cheap' | 'expensive' | 'vibe';

export const reviewTags: Record<ReviewTag, { label: string; emoji: string; tone: 'good' | 'bad' | 'info' }> = {
  'safe-alone': { label: 'בטוח לבד', emoji: '🛡️', tone: 'good' },
  unsafe: { label: 'הרגשתי לא בטוח', emoji: '⚠️', tone: 'bad' },
  israelis: { label: 'יש שם ישראלים', emoji: '🇮🇱', tone: 'info' },
  packed: { label: 'מוצף ישראלים', emoji: '🇮🇱🇮🇱', tone: 'info' },
  'no-israelis': { label: 'בלי ישראלים', emoji: '🌍', tone: 'info' },
  cheap: { label: 'זול יחסית', emoji: '💸', tone: 'good' },
  expensive: { label: 'יקר יחסית', emoji: '💰', tone: 'bad' },
  vibe: { label: 'אווירה מעולה', emoji: '✨', tone: 'good' },
};

export interface Review {
  id: string;
  placeId: string;
  stars: number; // 1–5
  text: string;
  /** Month of the visit, YYYY-MM – reviews are only useful if you know when they're from */
  visited: string;
  costUsd?: number;
  tags: ReviewTag[];
  /** Small JPEG data URL */
  photo?: string;
  createdAt: number;
}

export interface CheckIn {
  placeId: string;
  at: number;
}

export interface Community {
  customPlaces: Place[];
  reviews: Review[];
  checkIn: CheckIn | null;
  saved: string[];
}

export const emptyCommunity: Community = { customPlaces: [], reviews: [], checkIn: null, saved: [] };

const KEY = 'community';

function load(): Community {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...emptyCommunity, ...JSON.parse(raw) } : emptyCommunity;
  } catch {
    return emptyCommunity;
  }
}

function persist(value: Community): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Unlike usePersistentState, updates are saved synchronously and report failure,
 * because photos can fill up device storage and silently losing a review is bad.
 */
export function useCommunity() {
  const [community, setCommunity] = useState<Community>(load);

  const update = useCallback((fn: (prev: Community) => Community): boolean => {
    const next = fn(load());
    if (!persist(next)) return false;
    setCommunity(next);
    return true;
  }, []);

  return { community, update };
}

export function allPlaces(community: Community): Place[] {
  return [...curatedPlaces, ...community.customPlaces];
}

export function regionOf(place: Place): RegionId | undefined {
  return countries.find((c) => c.id === place.countryId)?.region;
}

export interface ReviewStats {
  count: number;
  average: number | null;
  tagCounts: { tag: ReviewTag; count: number }[];
  averageCostUsd: number | null;
}

export function reviewStats(reviews: Review[]): ReviewStats {
  const count = reviews.length;
  const tagMap = new Map<ReviewTag, number>();
  for (const r of reviews) for (const t of r.tags) tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
  const costs = reviews.map((r) => r.costUsd).filter((c): c is number => typeof c === 'number' && c > 0);
  return {
    count,
    average: count ? reviews.reduce((s, r) => s + r.stars, 0) / count : null,
    tagCounts: [...tagMap].map(([tag, c]) => ({ tag, count: c })).sort((a, b) => b.count - a.count),
    averageCostUsd: costs.length ? costs.reduce((s, c) => s + c, 0) / costs.length : null,
  };
}

const israeliRank: Record<IsraeliLevel, number> = { high: 3, some: 2, low: 1 };

export interface HotNow {
  festivalsNow: Place[];
  festivalsNext: Place[];
  hotspots: Place[];
}

/**
 * "What's hot now": festivals happening this month and next, plus gathering spots,
 * Israeli hubs and party places that are in season – busiest first.
 */
export function hotNow(list: Place[], month: number, region?: RegionId): HotNow {
  const next = (month % 12) + 1;
  const inRegion = list.filter((p) => !region || regionOf(p) === region);
  const festivals = inRegion.filter((p) => p.category === 'festival');
  return {
    festivalsNow: festivals.filter((p) => p.months?.includes(month)),
    festivalsNext: festivals.filter((p) => p.months?.includes(next) && !p.months.includes(month)),
    hotspots: inRegion
      .filter((p) => ['gathering', 'israeli', 'party'].includes(p.category) && p.months && p.months.length < 12 && isInSeason(p, month))
      .sort((a, b) => israeliRank[b.israeli ?? 'low'] - israeliRank[a.israeli ?? 'low']),
  };
}

/** Downscale a photo to a small JPEG so reviews with photos fit in device storage. */
export function resizeImage(file: File, maxSize = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

/** Share via the native share sheet, falling back to WhatsApp. */
export async function shareText(text: string, url?: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ text, url });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(url ? `${text}\n${url}` : text)}`, '_blank', 'noopener');
}
