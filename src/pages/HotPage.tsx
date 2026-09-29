import { allPlaces, hotNow, useCommunity } from '../community';
import { getCountry, regions } from '../data/countries';
import { categoryInfo, israeliLevelInfo, monthNames, type Place } from '../data/places';
import type { RegionId } from '../data/types';
import { usePersistentState } from '../storage';
import PageHeader from '../components/PageHeader';

type Filter = 'all' | RegionId;

export default function HotPage() {
  const { community } = useCommunity();
  const [filter, setFilter] = usePersistentState<Filter>('hot-region', 'all');
  const month = new Date().getMonth() + 1;
  const nextMonth = (month % 12) + 1;
  const hot = hotNow(allPlaces(community), month, filter === 'all' ? undefined : filter);

  return (
    <>
      <PageHeader title="🔥 מה חם עכשיו" subtitle={`מה קורה ב${monthNames[month - 1]} על השביל – פסטיבלים, נקודות מפגש ומקומות בשיא העונה.`} />

      <div className="chips" role="tablist" aria-label="אזור">
        {([['all', '🌍 הכל'], ...regions.map((r) => [r.id, `${r.emoji} ${r.name}`])] as [Filter, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={filter === id} className={`chip ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      <HotSection title={`🎊 קורה החודש (${monthNames[month - 1]})`} places={hot.festivalsNow} empty="אין פסטיבל גדול החודש באזור הזה." />
      <HotSection title={`📅 בחודש הבא (${monthNames[nextMonth - 1]}) – תכננו מראש`} places={hot.festivalsNext} empty="אין פסטיבלים גדולים בחודש הבא." />
      <HotSection title="🚩 איפה כולם עכשיו – בשיא העונה" places={hot.hotspots} empty="אין נקודות בשיא עונה כרגע באזור הזה." />

      <p className="disclaimer">
        "חם עכשיו" מחושב לפי לוח השנה והעונות של כל מקום. תאריכי פסטיבלים לפי לוחות שנה מקומיים משתנים משנה לשנה – בדקו תאריך מדויק לפני שמתכננים.
      </p>
    </>
  );
}

function HotSection({ title, places, empty }: { title: string; places: Place[]; empty: string }) {
  return (
    <>
      <h2 className="section-title">{title}</h2>
      {places.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ul className="hot-list">
          {places.map((p) => {
            const c = getCountry(p.countryId);
            const info = categoryInfo[p.category];
            return (
              <li key={p.id}>
                <a href={`#/map/${p.id}`} className="card hot-card" style={{ '--cat': info.color } as React.CSSProperties}>
                  <span className="hot-emoji" aria-hidden="true">
                    {info.emoji}
                  </span>
                  <span className="hot-text">
                    <strong>{p.name}</strong>
                    <span className="muted small">
                      {c?.flag} {c?.name}
                      {p.when && ` · ${p.when}`}
                      {!p.when && p.israeli && ` · ${israeliLevelInfo[p.israeli]}`}
                    </span>
                    <span className="small">{p.desc}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
