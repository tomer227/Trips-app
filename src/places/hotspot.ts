import type { IsraeliLevel, Place } from '../data/places';
import type { Review } from '../community';

/**
 * "Hummus trail" presence is a separate signal from Google's rating. It comes either from the
 * editorial team's curation or from community reports – never from a place merely being popular.
 */
export interface IsraeliHotspot {
  presence: IsraeliLevel;
  source: 'editorial' | 'community';
  reportCount: number;
  lastReportAt?: string; // YYYY-MM of the latest report
  confidence: 'low' | 'medium' | 'high';
}

export function hotspotFor(place: Place, reviews: Review[]): IsraeliHotspot | null {
  const reports = reviews.filter((r) => r.tags.some((t) => t === 'israelis' || t === 'packed' || t === 'no-israelis'));
  const positive = reports.filter((r) => r.tags.includes('israelis') || r.tags.includes('packed'));

  if (positive.length > 0) {
    const packed = positive.filter((r) => r.tags.includes('packed')).length;
    return {
      presence: packed * 2 >= positive.length ? 'high' : 'some',
      source: 'community',
      reportCount: positive.length,
      lastReportAt: positive.map((r) => r.visited).sort().at(-1),
      confidence: positive.length >= 5 ? 'high' : positive.length >= 2 ? 'medium' : 'low',
    };
  }
  // Curated places keep the team's assessment; Google places never get one without reports.
  if (place.israeli && place.source !== 'google') {
    return { presence: place.israeli, source: 'editorial', reportCount: 0, confidence: 'low' };
  }
  return null;
}

export function hotspotLabel(h: IsraeliHotspot): string {
  const who = h.source === 'community' ? 'לפי דיווחי הקהילה' : 'לפי צוות האפליקציה';
  if (h.presence === 'low') return `🌍 כמעט בלי ישראלים (${who})`;
  const text = h.presence === 'high' ? '🇮🇱 נקודת מפגש ישראלית' : '🇮🇱 ישראלים מדווחים כאן';
  const count = h.source === 'community' ? ` · ${h.reportCount} דיווחים` : '';
  return `${text} (${who}${count})`;
}
