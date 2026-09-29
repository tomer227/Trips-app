import { useEffect, useMemo, useRef, useState } from 'react';
import WorldMap, { type MapViewport, type WorldMapHandle } from '../components/WorldMap';
import PlaceSheet from '../components/PlaceSheet';
import PageHeader from '../components/PageHeader';
import PlacesPanel, { type SourceMode } from '../components/PlacesPanel';
import { allPlaces, hotNow, regionOf, useCommunity } from '../community';
import { countriesByRegion, getCountry, regions } from '../data/countries';
import { categoryInfo, isInSeason, type Place, type PlaceCategory } from '../data/places';
import type { RegionId } from '../data/types';
import type { TripPlan } from '../budget';
import { newId } from '../journal';
import { usePersistentState } from '../storage';
import { placesApi } from '../places/api';
import type { GoogleCategoryId } from '../places/categories';
import {
  applyFilters,
  dedupePlaces,
  distanceMeters,
  googleToPlace,
  mergeDetails,
  priceSymbols,
  sortPlaces,
  type PlaceFilters,
  type SortMode,
} from '../places/mapping';
import type { SearchRequest } from '../places/search';
import { useGoogleSearch } from '../places/usePlaces';

interface Props {
  initialPlaceId?: string;
  plan: TripPlan;
}

interface Draft {
  lat: number;
  lng: number;
  countryId: string;
  name: string;
  category: PlaceCategory;
  desc: string;
}

/** Google Nearby/Text Search accept at most a 50 km radius. */
const MAX_SEARCH_RADIUS_M = 50_000;
const MIN_SEARCH_RADIUS_M = 300;
/** City scale: the visible radius is about 13 km, well inside the 50 km search limit. */
const FOCUS_ZOOM = 250;

const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} מ׳` : `${(m / 1000).toFixed(1)} ק״מ`);

export default function MapPage({ initialPlaceId, plan }: Props) {
  const { community, update } = useCommunity();
  const everything = allPlaces(community);
  const initialPlace = everything.find((p) => p.id === initialPlaceId);

  const [storedRegion, setRegion] = usePersistentState<RegionId>('map-region', 'asia');
  const [selectedId, setSelectedId] = useState<string | null>(initialPlace?.id ?? null);
  const [hidden, setHidden] = usePersistentState<PlaceCategory[]>('map-hidden', []);
  const [seasonOnly, setSeasonOnly] = usePersistentState('map-season', false);
  const [source, setSource] = usePersistentState<SourceMode>('map-source', 'all');
  const [inPlanOnly, setInPlanOnly] = usePersistentState('map-in-plan', false);
  const [addMode, setAddMode] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  // Google layer
  const [request, setRequest] = useState<SearchRequest | null>(null);
  const [gCategory, setGCategory] = useState<GoogleCategoryId | null>(null);
  const [filters, setFilters] = useState<PlaceFilters>({});
  const [sort, setSort] = useState<SortMode>('google');
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [searchCenter, setSearchCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [areaHint, setAreaHint] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lng: number; k: number; nonce: number } | null>(null);
  const [pinned, setPinned] = useState<Place[]>([]);
  const [detailed, setDetailed] = useState<Record<string, Place>>({});
  const [savedOpen, setSavedOpen] = useState(false);
  const mapRef = useRef<WorldMapHandle>(null);

  const search = useGoogleSearch(source === 'community' ? null : request);

  const month = new Date().getMonth() + 1;
  // A deep-linked place (#/map/<id>) decides the region.
  const linkedRegion = initialPlace ? regionOf(initialPlace) : undefined;
  useEffect(() => {
    if (linkedRegion) setRegion(linkedRegion);
  }, [linkedRegion, setRegion]);
  const region = storedRegion;

  /* ─── Google places: results + pinned (from autocomplete / saved), merged with fetched details ─── */
  const googleAll = useMemo(
    () => dedupePlaces([...pinned, ...search.places]).map((p) => (detailed[p.id] ? mergeDetails(p, detailed[p.id]) : p)),
    [pinned, search.places, detailed],
  );
  const distanceFrom = userLoc ?? searchCenter ?? undefined;
  const googleShown = useMemo(
    () => sortPlaces(applyFilters(googleAll, filters, distanceFrom), sort, distanceFrom),
    [googleAll, filters, sort, distanceFrom],
  );

  /* ─── Community / team places ─── */
  const planCountries = new Set(plan.stops.map((s) => s.countryId));
  const visibleLocal =
    source === 'google'
      ? []
      : everything.filter(
          (p) =>
            regionOf(p) === region &&
            !hidden.includes(p.category) &&
            (!seasonOnly || p.category === 'warning' || isInSeason(p, month)) &&
            (!inPlanOnly || planCountries.has(p.countryId)),
        );
  const hot = hotNow(everything, month, region);
  const hotList = [...hot.festivalsNow, ...hot.hotspots].slice(0, 8);

  const selected = [...everything, ...googleAll].find((p) => p.id === selectedId) ?? null;

  // Open details (phone, hours, website, photo) only when a Google place is actually opened.
  useEffect(() => {
    const id = selected?.googlePlaceId;
    if (!selected || selected.source !== 'google' || !id || detailed[selected.id]) return;
    let alive = true;
    placesApi
      .details(id)
      .then((raw) => {
        const place = googleToPlace(raw, { fetchedAt: new Date().toISOString() });
        if (alive && place) setDetailed((d) => ({ ...d, [place.id]: place }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Deep link to a Google place (#/map/g:<placeId>).
  useEffect(() => {
    if (!initialPlaceId?.startsWith('g:')) return;
    void openGooglePlace(initialPlaceId.slice(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPlaceId]);

  async function openGooglePlace(placeId: string, sessionToken?: string) {
    try {
      const place = googleToPlace(await placesApi.details(placeId, sessionToken), { fetchedAt: new Date().toISOString() });
      if (!place) return;
      setPinned((list) => (list.some((p) => p.id === place.id) ? list : [...list, place]));
      setDetailed((d) => ({ ...d, [place.id]: place }));
      setSource((s) => (s === 'community' ? 'all' : s));
      setSelectedId(place.id);
      setFocus({ lat: place.lat, lng: place.lng, k: FOCUS_ZOOM, nonce: Date.now() });
      history.replaceState(null, '', `#/map/${place.id}`);
    } catch {
      setAreaHint('לא הצלחנו לפתוח את המקום מ־Google. נסו שוב.');
    }
  }

  const select = (p: Place | null) => {
    setSelectedId(p?.id ?? null);
    setDraft(null);
    history.replaceState(null, '', p ? `#/map/${p.id}` : '#/map');
  };

  const switchRegion = (id: RegionId) => {
    setRegion(id);
    select(null);
  };

  const toggleCategory = (c: PlaceCategory) => setHidden((h) => (h.includes(c) ? h.filter((x) => x !== c) : [...h, c]));

  /** Search around what the map shows – only when zoomed in enough, and only on an explicit action. */
  function viewportForSearch(): MapViewport | null {
    const vp = mapRef.current?.getViewport() ?? null;
    if (!vp) return null;
    if (vp.radiusM > MAX_SEARCH_RADIUS_M) {
      setAreaHint('התקרבו לעיר או לאזור קטן על המפה (עד כ־50 ק״מ) ואז לחצו שוב.');
      return null;
    }
    return vp;
  }

  function runArea(query: string | undefined, category: GoogleCategoryId | null) {
    setAreaHint(null);
    const vp = viewportForSearch();
    if (!vp) return;
    const radius = Math.min(MAX_SEARCH_RADIUS_M, Math.max(MIN_SEARCH_RADIUS_M, Math.round(vp.radiusM)));
    setSearchCenter({ lat: vp.lat, lng: vp.lng });
    if (query) setRequest({ kind: 'search', query, lat: vp.lat, lng: vp.lng, radius, category: category ?? undefined });
    else if (category) setRequest({ kind: 'nearby', lat: vp.lat, lng: vp.lng, radius, category });
  }

  function locateMe() {
    setAreaHint(null);
    if (!('geolocation' in navigator)) {
      setAreaHint('המכשיר לא תומך באיתור מיקום.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(here);
        setSearchCenter(here);
        setFocus({ ...here, k: FOCUS_ZOOM, nonce: Date.now() });
        setSort((s) => (s === 'google' ? 'distance' : s));
        if (gCategory) setRequest({ kind: 'nearby', ...here, radius: 2000, category: gCategory });
      },
      () => {
        setLocating(false);
        setAreaHint('לא הצלחנו לאתר אתכם. אפשר להתקרב ידנית על המפה ולחפש באזור.');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  const saveDraft = () => {
    if (!draft || !draft.name.trim()) return;
    const place: Place = {
      id: `c-${newId()}`,
      countryId: draft.countryId,
      name: draft.name.trim(),
      category: draft.category,
      lat: draft.lat,
      lng: draft.lng,
      desc: draft.desc.trim(),
      custom: true,
    };
    if (update((c) => ({ ...c, customPlaces: [...c.customPlaces, place] }))) {
      setDraft(null);
      select(place);
    }
  };

  const regionCountries = countriesByRegion(region);
  const mapPlaces = source === 'community' ? visibleLocal : [...visibleLocal, ...googleShown];
  const showGoogle = source !== 'community';

  // Saved places: local ones are known; Google ones are resolved lazily when the list is opened.
  const savedLocal = everything.filter((p) => community.saved.includes(p.id));
  const savedGoogleIds = community.saved.filter((id) => id.startsWith('g:'));
  useEffect(() => {
    if (!savedOpen) return;
    for (const id of savedGoogleIds) {
      if (detailed[id]) continue;
      placesApi
        .details(id.slice(2))
        .then((raw) => {
          const place = googleToPlace(raw, { fetchedAt: new Date().toISOString() });
          if (place) setDetailed((d) => ({ ...d, [place.id]: place }));
        })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedOpen, savedGoogleIds.join(',')]);

  return (
    <>
      <PageHeader title="🗺️ המפה" subtitle="שביל החומוס על מפה אחת: המלצות של הקהילה והצוות, ומקומות אמיתיים מ־Google עם עין ישראלית." />

      <div className="chips" role="tablist" aria-label="אזור">
        {regions.map((r) => (
          <button key={r.id} role="tab" aria-selected={region === r.id} className={`chip ${region === r.id ? 'active' : ''}`} onClick={() => switchRegion(r.id)}>
            {r.emoji} {r.name}
          </button>
        ))}
      </div>

      <PlacesPanel
        source={source}
        onSource={setSource}
        category={gCategory}
        onCategory={(c) => {
          setGCategory(c);
          if (c) runArea(undefined, c);
          else setRequest(null);
        }}
        near={searchCenter ?? undefined}
        onSubmitQuery={(q) => runArea(q, gCategory)}
        onPickSuggestion={(id, token) => void openGooglePlace(id, token)}
        onSearchArea={(q) => runArea(q || undefined, gCategory)}
        onLocate={locateMe}
        locating={locating}
        areaHint={areaHint}
        filters={filters}
        onFilters={setFilters}
        sort={sort}
        onSort={setSort}
        hasLocation={!!distanceFrom}
        inPlanOnly={inPlanOnly}
        onInPlanOnly={setInPlanOnly}
        hasPlan={plan.stops.length > 0}
        status={search.status}
        shown={googleShown.length}
        hiddenByFilters={googleAll.length - googleShown.length}
      />

      {addMode && <div className="add-hint">👆 לחצו על המפה במקום שתרצו להוסיף (אפשר להתקרב קודם)</div>}

      <WorldMap
        ref={mapRef}
        region={region}
        places={mapPlaces}
        selectedId={selectedId}
        checkInId={community.checkIn?.placeId ?? null}
        onSelect={select}
        addMode={addMode}
        focus={focus}
        onAddAt={(lat, lng, countryId) => {
          setAddMode(false);
          setDraft({ lat, lng, countryId: countryId ?? regionCountries[0].id, name: '', category: 'attraction', desc: '' });
        }}
      />

      <div className="map-toolbar">
        <label className="switch">
          <input type="checkbox" checked={seasonOnly} onChange={(e) => setSeasonOnly(e.target.checked)} />
          <span>🌤️ רק מה שבעונה עכשיו</span>
        </label>
        <button
          className={`btn btn-small ${addMode ? '' : 'btn-secondary'}`}
          onClick={() => {
            setAddMode(!addMode);
            setDraft(null);
            select(null);
          }}
        >
          {addMode ? 'ביטול' : '+ הוספת מקום'}
        </button>
      </div>

      {source !== 'google' && (
        <div className="chips cat-chips" aria-label="סינון מקומות הקהילה לפי קטגוריה">
          {(Object.keys(categoryInfo) as PlaceCategory[]).map((c) => {
            const on = !hidden.includes(c);
            return (
              <button
                key={c}
                className={`chip cat-chip ${on ? 'on' : 'off'}`}
                style={{ '--cat': categoryInfo[c].color } as React.CSSProperties}
                onClick={() => toggleCategory(c)}
                aria-pressed={on}
              >
                {categoryInfo[c].emoji} {categoryInfo[c].label}
              </button>
            );
          })}
        </div>
      )}

      {showGoogle && googleShown.length > 0 && (
        <>
          <h2 className="section-title">🌐 מקומות מ־Google ({googleShown.length})</h2>
          <p className="source-note source-google">מידע חיצוני מ־Google – לא המלצה של האפליקציה. הדירוג הוא של Google, לא של הקהילה.</p>
          <ul className="place-rows">
            {googleShown.map((p) => (
              <li key={p.id}>
                <button className="place-row google-row" onClick={() => select(p)}>
                  <span className="dot" style={{ background: categoryInfo[p.category].color }} aria-hidden="true">
                    {categoryInfo[p.category].emoji}
                  </span>
                  <span className="place-row-text">
                    <strong>{p.name}</strong>
                    <span className="muted small">
                      {p.rating !== undefined && `⭐ ${p.rating.toFixed(1)}${p.userRatingCount ? ` (${p.userRatingCount.toLocaleString('en-US')})` : ''} · `}
                      {p.priceLevel && `${priceSymbols(p.priceLevel)} · `}
                      {p.openNow === true && 'פתוח עכשיו · '}
                      {p.openNow === false && 'סגור עכשיו · '}
                      {distanceFrom && formatDistance(distanceMeters(distanceFrom, p))}
                      {community.reviews.some((r) => r.placeId === p.id) && ' · 🇮🇱 יש חוויות'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {(savedLocal.length > 0 || savedGoogleIds.length > 0) && (
        <>
          <button className="accordion-head saved-head" aria-expanded={savedOpen} onClick={() => setSavedOpen(!savedOpen)}>
            <span>💚 רוצה להגיע ({savedLocal.length + savedGoogleIds.length})</span>
            <span className="muted">{savedOpen ? '▴' : '▾'}</span>
          </button>
          {savedOpen && (
            <ul className="place-rows">
              {savedLocal.map((p) => (
                <SavedRow key={p.id} place={p} onOpen={() => select(p)} />
              ))}
              {savedGoogleIds.map((id) => {
                const place = detailed[id] ?? googleAll.find((p) => p.id === id);
                return place ? (
                  <SavedRow
                    key={id}
                    place={place}
                    onOpen={() => {
                      setPinned((list) => (list.some((p) => p.id === place.id) ? list : [...list, place]));
                      setSource((s) => (s === 'community' ? 'all' : s));
                      select(place);
                      setFocus({ lat: place.lat, lng: place.lng, k: FOCUS_ZOOM, nonce: Date.now() });
                    }}
                  />
                ) : (
                  <li key={id} className="muted small">
                    טוען מקום שמור…
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {hotList.length > 0 && source !== 'google' && (
        <>
          <h2 className="section-title">🔥 פופולרי בעונה זו באזור</h2>
          <div className="chips">
            {hotList.map((p) => (
              <button key={p.id} className="chip" onClick={() => select(p)}>
                {categoryInfo[p.category].emoji} {p.name}
              </button>
            ))}
          </div>
          <a className="link small" href="#/hot">
            כל מה שפופולרי החודש ←
          </a>
        </>
      )}

      {source !== 'google' && (
        <>
          <h2 className="section-title">מקומות הקהילה והצוות ({visibleLocal.length})</h2>
          <p className="source-note">נבחרו על ידי צוות האפליקציה ומשתמשים.</p>
          {regionCountries.map((country) => {
            const list = visibleLocal.filter((p) => p.countryId === country.id);
            if (!list.length) return null;
            return (
              <section key={country.id} className="place-group">
                <h3>
                  {country.flag} {country.name}
                </h3>
                <ul className="place-rows">
                  {list.map((p) => (
                    <li key={p.id}>
                      <button className="place-row" onClick={() => select(p)}>
                        <span className="dot" style={{ background: categoryInfo[p.category].color }} aria-hidden="true">
                          {categoryInfo[p.category].emoji}
                        </span>
                        <span className="place-row-text">
                          <strong>{p.name}</strong>
                          <span className="muted small">
                            {categoryInfo[p.category].label}
                            {p.when && ` · ${p.when}`}
                            {community.reviews.some((r) => r.placeId === p.id) && ' · ⭐ יש ביקורות'}
                            {p.safety && ' · ⚠️'}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {selected && !draft && <PlaceSheet place={selected} community={community} update={update} onClose={() => select(null)} />}

      {draft && (
        <div className="sheet" role="dialog" aria-label="הוספת מקום">
          <div className="sheet-handle" aria-hidden="true" />
          <button className="sheet-close" onClick={() => setDraft(null)} aria-label="סגירה">
            ✕
          </button>
          <h2 className="sheet-title">📌 מקום חדש</h2>
          <div className="form-grid">
            <label>
              <span>שם המקום</span>
              <input type="text" autoFocus placeholder="למשל: ההוסטל עם הגג בפאי" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <div className="form-row">
              <label>
                <span>קטגוריה</span>
                <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as PlaceCategory })}>
                  {(Object.keys(categoryInfo) as PlaceCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {categoryInfo[c].emoji} {categoryInfo[c].label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>מדינה</span>
                <select value={draft.countryId} onChange={(e) => setDraft({ ...draft, countryId: e.target.value })}>
                  {regionCountries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              <span>תיאור קצר</span>
              <textarea rows={3} placeholder="מה יש שם ולמה שווה להגיע?" value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} />
            </label>
            <p className="muted small">
              📍 {getCountry(draft.countryId)?.name} · {draft.lat.toFixed(3)}, {draft.lng.toFixed(3)}
            </p>
            <div className="form-actions">
              <button className="btn" onClick={saveDraft} disabled={!draft.name.trim()}>
                שמירה
              </button>
              <button className="btn btn-secondary" onClick={() => setDraft(null)}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SavedRow({ place, onOpen }: { place: Place; onOpen: () => void }) {
  return (
    <li>
      <button className="place-row" onClick={onOpen}>
        <span className="dot" style={{ background: categoryInfo[place.category].color }} aria-hidden="true">
          {categoryInfo[place.category].emoji}
        </span>
        <span className="place-row-text">
          <strong>{place.name}</strong>
          <span className="muted small">{place.source === 'google' ? 'מ־Google' : categoryInfo[place.category].label}</span>
        </span>
      </button>
    </li>
  );
}
