import { useEffect, useState } from 'react';
import WorldMap from '../components/WorldMap';
import PlaceSheet from '../components/PlaceSheet';
import PageHeader from '../components/PageHeader';
import { allPlaces, hotNow, regionOf, useCommunity } from '../community';
import { countriesByRegion, getCountry, regions } from '../data/countries';
import { categoryInfo, isInSeason, type Place, type PlaceCategory } from '../data/places';
import type { RegionId } from '../data/types';
import { newId } from '../journal';
import { usePersistentState } from '../storage';

interface Props {
  initialPlaceId?: string;
}

interface Draft {
  lat: number;
  lng: number;
  countryId: string;
  name: string;
  category: PlaceCategory;
  desc: string;
}

export default function MapPage({ initialPlaceId }: Props) {
  const { community, update } = useCommunity();
  const everything = allPlaces(community);
  const initialPlace = everything.find((p) => p.id === initialPlaceId);

  const [storedRegion, setRegion] = usePersistentState<RegionId>('map-region', 'asia');
  const [selectedId, setSelectedId] = useState<string | null>(initialPlace?.id ?? null);
  const [hidden, setHidden] = usePersistentState<PlaceCategory[]>('map-hidden', []);
  const [seasonOnly, setSeasonOnly] = usePersistentState('map-season', false);
  const [addMode, setAddMode] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const month = new Date().getMonth() + 1;
  const selected = everything.find((p) => p.id === selectedId) ?? null;
  // A deep-linked place (#/map/<id>) decides the region.
  const linkedRegion = initialPlace ? regionOf(initialPlace) : undefined;
  useEffect(() => {
    if (linkedRegion) setRegion(linkedRegion);
  }, [linkedRegion, setRegion]);
  const region = storedRegion;

  const visible = everything.filter(
    (p) =>
      regionOf(p) === region &&
      !hidden.includes(p.category) &&
      (!seasonOnly || p.category === 'warning' || isInSeason(p, month)),
  );
  const hot = hotNow(everything, month, region);
  const hotList = [...hot.festivalsNow, ...hot.hotspots].slice(0, 8);

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

  return (
    <>
      <PageHeader title="🗺️ המפה" subtitle="שביל החומוס על מפה אחת: אטרקציות, אוכל, לינה, מסיבות, פסטיבלים ונקודות התארגנות." />

      <div className="chips" role="tablist" aria-label="אזור">
        {regions.map((r) => (
          <button key={r.id} role="tab" aria-selected={region === r.id} className={`chip ${region === r.id ? 'active' : ''}`} onClick={() => switchRegion(r.id)}>
            {r.emoji} {r.name}
          </button>
        ))}
      </div>

      <div className="chips cat-chips" aria-label="סינון לפי קטגוריה">
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

      {addMode && <div className="add-hint">👆 לחצו על המפה במקום שתרצו להוסיף (אפשר להתקרב קודם)</div>}

      <WorldMap
        region={region}
        places={visible}
        selectedId={selectedId}
        checkInId={community.checkIn?.placeId ?? null}
        onSelect={select}
        addMode={addMode}
        onAddAt={(lat, lng, countryId) => {
          setAddMode(false);
          setDraft({ lat, lng, countryId: countryId ?? regionCountries[0].id, name: '', category: 'attraction', desc: '' });
        }}
      />

      {hotList.length > 0 && (
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

      <h2 className="section-title">כל המקומות ({visible.length})</h2>
      {regionCountries.map((country) => {
        const list = visible.filter((p) => p.countryId === country.id);
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
