import { useState } from 'react';
import { googleCategories, type GoogleCategoryId } from '../places/categories';
import { priceOrder, priceSymbols, type PlaceFilters, type SortMode } from '../places/mapping';
import { statusMessages, type SearchStatus } from '../places/search';
import { useAutocomplete } from '../places/usePlaces';
import type { PriceLevel } from '../data/places';

export type SourceMode = 'all' | 'community' | 'google';

interface Props {
  source: SourceMode;
  onSource: (s: SourceMode) => void;

  category: GoogleCategoryId | null;
  onCategory: (c: GoogleCategoryId | null) => void;

  /** Search near this point for autocomplete suggestions */
  near?: { lat: number; lng: number };
  onSubmitQuery: (query: string) => void;
  onPickSuggestion: (placeId: string, sessionToken: string) => void;

  /** `query` is the text currently typed in the search box (may be empty) */
  onSearchArea: (query: string) => void;
  onLocate: () => void;
  locating: boolean;
  areaHint: string | null;

  filters: PlaceFilters;
  onFilters: (f: PlaceFilters) => void;
  sort: SortMode;
  onSort: (s: SortMode) => void;
  hasLocation: boolean;

  inPlanOnly: boolean;
  onInPlanOnly: (v: boolean) => void;
  hasPlan: boolean;

  status: SearchStatus;
  shown: number;
  hiddenByFilters: number;
}

export default function PlacesPanel(p: Props) {
  const ac = useAutocomplete(p.near);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showGoogle = p.source !== 'community';
  const activeFilters = [p.filters.minRating, p.filters.maxPrice, p.filters.openNow || undefined, p.filters.maxDistanceM].filter((v) => v !== undefined).length;

  return (
    <section className="places-panel" aria-label="חיפוש מקומות">
      <div className="segmented compact places-source" role="radiogroup" aria-label="מקור המקומות">
        {(
          [
            ['all', 'הכול'],
            ['community', '🇮🇱 קהילה'],
            ['google', 'Google'],
          ] as [SourceMode, string][]
        ).map(([value, label]) => (
          <button key={value} role="radio" aria-checked={p.source === value} className={p.source === value ? 'active' : undefined} onClick={() => p.onSource(value)}>
            {label}
          </button>
        ))}
      </div>

      {showGoogle && (
        <>
          <form
            className="place-search"
            onSubmit={(e) => {
              e.preventDefault();
              const q = ac.input.trim();
              if (q) {
                p.onSubmitQuery(q);
                ac.endSession();
              }
            }}
          >
            <input
              id="place-search-input"
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder="חפש מקום, מסעדה, מלון, אטרקציה..."
              value={ac.input}
              onChange={(e) => ac.setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && ac.dismiss()}
              aria-label="חיפוש מקומות"
              aria-expanded={ac.suggestions.length > 0}
            />
            {ac.suggestions.length > 0 && (
              <ul className="suggestions" role="listbox">
                {ac.suggestions.map((s) => (
                  <li key={s.placeId} role="option" aria-selected="false">
                    <button
                      type="button"
                      onClick={() => {
                        p.onPickSuggestion(s.placeId, ac.sessionToken());
                        ac.pick(s.main);
                        ac.endSession();
                      }}
                    >
                      <strong>{s.main}</strong>
                      {s.secondary && <span className="muted small">{s.secondary}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>

          <div className="chips google-cats" aria-label="קטגוריות">
            {googleCategories.map((c) => (
              <button key={c.id} className={`chip ${p.category === c.id ? 'active' : ''}`} aria-pressed={p.category === c.id} onClick={() => p.onCategory(p.category === c.id ? null : c.id)}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>

          <div className="places-actions">
            <button className="btn btn-small" onClick={() => p.onSearchArea(ac.input.trim())} disabled={!p.category && !ac.input.trim()}>
              🔍 חפש באזור הזה
            </button>
            <button className="btn btn-secondary btn-small" onClick={p.onLocate} disabled={p.locating}>
              {p.locating ? 'מאתר…' : '📍 קרוב אליי'}
            </button>
            <button className={`btn btn-secondary btn-small ${activeFilters ? 'on' : ''}`} onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>
              ⚙️ סינון{activeFilters ? ` (${activeFilters})` : ''}
            </button>
          </div>
          {p.areaHint && <p className="muted small">{p.areaHint}</p>}

          {filtersOpen && (
            <div className="card filter-box">
              <label>
                <span>מרחק</span>
                <select
                  value={p.filters.maxDistanceM ?? ''}
                  disabled={!p.hasLocation}
                  onChange={(e) => p.onFilters({ ...p.filters, maxDistanceM: e.target.value ? Number(e.target.value) : undefined })}
                >
                  <option value="">{p.hasLocation ? 'ללא הגבלה' : 'הפעילו "קרוב אליי"'}</option>
                  {[500, 1000, 2000, 5000].map((m) => (
                    <option key={m} value={m}>
                      עד {m >= 1000 ? `${m / 1000} ק״מ` : `${m} מ׳`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>דירוג Google</span>
                <select value={p.filters.minRating ?? ''} onChange={(e) => p.onFilters({ ...p.filters, minRating: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">הכול</option>
                  <option value="4">4.0+</option>
                  <option value="4.5">4.5+</option>
                </select>
              </label>
              <label>
                <span>מחיר</span>
                <select value={p.filters.maxPrice ?? ''} onChange={(e) => p.onFilters({ ...p.filters, maxPrice: (e.target.value || undefined) as PriceLevel | undefined })}>
                  <option value="">הכול</option>
                  {priceOrder.slice(1, 4).map((l) => (
                    <option key={l} value={l}>
                      עד {priceSymbols(l)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>מיון</span>
                <select value={p.sort} onChange={(e) => p.onSort(e.target.value as SortMode)}>
                  <option value="google">מובילים ב־Google</option>
                  <option value="rating">דירוג Google</option>
                  <option value="distance" disabled={!p.hasLocation}>
                    קרוב אליי
                  </option>
                </select>
              </label>
              <label className="switch full">
                <input type="checkbox" checked={!!p.filters.openNow} onChange={(e) => p.onFilters({ ...p.filters, openNow: e.target.checked || undefined })} />
                <span>פתוח עכשיו</span>
              </label>
              <p className="muted small full">כשסינון פעיל, מקומות ש־Google לא סיפקה עליהם את הנתון מוסתרים – לא מנחשים.</p>
              {activeFilters > 0 && (
                <button className="link-btn full" onClick={() => p.onFilters({})}>
                  ניקוי סינון
                </button>
              )}
            </div>
          )}

          <SearchStatusLine status={p.status} shown={p.shown} hidden={p.hiddenByFilters} />
        </>
      )}

      {p.hasPlan && p.source !== 'google' && (
        <label className="switch">
          <input type="checkbox" checked={p.inPlanOnly} onChange={(e) => p.onInPlanOnly(e.target.checked)} />
          <span>🧭 רק מדינות שבמסלול שלי</span>
        </label>
      )}
    </section>
  );
}

function SearchStatusLine({ status, shown, hidden }: { status: SearchStatus; shown: number; hidden: number }) {
  if (status === 'idle') return null;
  if (status === 'ok') {
    return (
      <p className="muted small" role="status">
        {shown} תוצאות מ־Google
        {hidden > 0 && ` · ${hidden} מוסתרות בגלל הסינון`}
      </p>
    );
  }
  return (
    <p className={`status-line status-${status}`} role="status">
      {statusMessages[status]}
    </p>
  );
}
