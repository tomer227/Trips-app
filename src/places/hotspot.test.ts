import { describe, expect, it } from 'vitest';
import { hotspotFor, hotspotLabel } from './hotspot';
import type { Place } from '../data/places';
import type { Review } from '../community';

const place = (over: Partial<Place> = {}): Place => ({ id: 'p', countryId: 'peru', name: 'x', category: 'food', lat: 0, lng: 0, desc: '', ...over });
const review = (tags: Review['tags'], visited = '2026-01'): Review => ({ id: Math.random().toString(), placeId: 'p', stars: 4, text: '', visited, tags, createdAt: 0 });

describe('hotspotFor', () => {
  it('never marks a Google place as Israeli without community reports', () => {
    expect(hotspotFor(place({ source: 'google', rating: 4.9, userRatingCount: 9000 }), [])).toBeNull();
  });

  it('keeps the editorial assessment for curated places', () => {
    const h = hotspotFor(place({ israeli: 'high' }), []);
    expect(h).toMatchObject({ presence: 'high', source: 'editorial', confidence: 'low' });
    expect(hotspotLabel(h!)).toContain('לפי צוות האפליקציה');
  });

  it('derives presence, count, recency and confidence from community reports', () => {
    const reviews = [review(['packed'], '2026-01'), review(['israelis'], '2026-03'), review(['packed'], '2025-12')];
    const h = hotspotFor(place({ source: 'google' }), reviews)!;
    expect(h).toMatchObject({ source: 'community', reportCount: 3, lastReportAt: '2026-03', confidence: 'medium', presence: 'high' });
    expect(hotspotLabel(h)).toContain('3 דיווחים');
  });

  it('does not count "no Israelis" reports as a hotspot', () => {
    expect(hotspotFor(place({ source: 'google' }), [review(['no-israelis'])])).toBeNull();
  });
});
