import { beforeEach, describe, expect, it } from 'vitest';

// Minimal localStorage stand-in for the node test environment.
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  configurable: true,
});

const { placeRepository, reviewRepository, checkinRepository } = await import('./index');

beforeEach(() => store.clear());

describe('repositories (localStorage implementation)', () => {
  it('saves and unsaves places without duplicates', () => {
    placeRepository.setSaved('g:abc', true);
    placeRepository.setSaved('g:abc', true);
    expect(placeRepository.listSavedIds()).toEqual(['g:abc']);
    placeRepository.setSaved('g:abc', false);
    expect(placeRepository.listSavedIds()).toEqual([]);
  });

  it('stores reviews per place and check-in separately', () => {
    reviewRepository.add({ id: '1', placeId: 'a', stars: 5, text: '', visited: '2026-01', tags: [], createdAt: 0 });
    reviewRepository.add({ id: '2', placeId: 'b', stars: 3, text: '', visited: '2026-01', tags: [], createdAt: 0 });
    expect(reviewRepository.list('a').map((r) => r.id)).toEqual(['1']);
    checkinRepository.set({ placeId: 'a', at: 1 });
    expect(checkinRepository.get()).toEqual({ placeId: 'a', at: 1 });
    reviewRepository.remove('1');
    expect(reviewRepository.list().map((r) => r.id)).toEqual(['2']);
    expect(checkinRepository.get()?.placeId).toBe('a');
  });
});
