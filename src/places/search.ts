import type { Place } from '../data/places';
import { getGoogleCategory } from './categories';
import { PlacesError, type PlacesApi } from './api';
import { mapGoogleResults } from './mapping';

export type SearchStatus = 'idle' | 'loading' | 'ok' | 'empty' | 'error' | 'offline' | 'unavailable' | 'rate_limited';

export interface SearchOutcome {
  status: Exclude<SearchStatus, 'idle' | 'loading'>;
  places: Place[];
}

export type SearchRequest =
  | { kind: 'nearby'; lat: number; lng: number; radius: number; category: string }
  | { kind: 'search'; query: string; lat?: number; lng?: number; radius?: number; category?: string };

/** Runs one search and folds every failure mode into a status the UI can show. Never throws. */
export async function runSearch(api: PlacesApi, req: SearchRequest, now: () => Date = () => new Date()): Promise<SearchOutcome> {
  try {
    const category = req.category ? getGoogleCategory(req.category) : undefined;
    const raw = req.kind === 'nearby' ? await api.nearby(req) : await api.search(req);
    const places = mapGoogleResults(raw, { category, fetchedAt: now().toISOString() });
    return { status: places.length ? 'ok' : 'empty', places };
  } catch (e) {
    const kind = e instanceof PlacesError ? e.kind : 'server';
    return { status: kind === 'server' ? 'error' : kind, places: [] };
  }
}

export const statusMessages: Record<SearchOutcome['status'] | 'loading', string> = {
  loading: 'מחפש מקומות באזור...',
  ok: '',
  empty: 'לא מצאנו מקומות מתאימים. נסה להרחיב את האזור.',
  error: 'לא הצלחנו לטעון מקומות כרגע. נסה שוב.',
  offline: 'אתה במצב לא מקוון – מציג מקומות שנשמרו באפליקציה.',
  unavailable: 'החיפוש ב־Google לא זמין כרגע בגרסה הזו. המקומות של הקהילה ממשיכים לעבוד.',
  rate_limited: 'יותר מדי חיפושים בזמן קצר. נסה שוב בעוד רגע.',
};

/** Trailing-edge debounce with cancel. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}
