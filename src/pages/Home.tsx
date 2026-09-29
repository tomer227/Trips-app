import { regions, countriesByRegion } from '../data/countries';
import { calcTrip, formatDuration, formatUsd, type TripPlan } from '../budget';
import { allPlaces, hotNow, shareText, useCommunity } from '../community';
import { categoryInfo, monthNames } from '../data/places';

const quickLinks = [
  { href: '#/map', icon: '🗺️', title: 'המפה', desc: 'שביל החומוס עם ביקורות' },
  { href: '#/plan', icon: '🧭', title: 'תכנון ותקציב', desc: 'בנו מסלול וקבלו הערכת עלות' },
  { href: '#/journal', icon: '📔', title: 'יומן והוצאות', desc: 'זיכרונות ומעקב אחרי התקציב' },
  { href: '#/currency', icon: '💱', title: 'ממיר מטבע', desc: 'כמה זה בשקלים?' },
  { href: '#/checklist', icon: '🎒', title: 'מה לארוז', desc: 'צ׳קליסט שנשמר אצלכם' },
  { href: '#/tips', icon: '💡', title: 'טיפים חשובים', desc: 'כסף, בריאות, ביטוח ובטיחות' },
  { href: '#/phrases', icon: '💬', title: 'משפטים שימושיים', desc: 'ספרדית, תאילנדית, הינדית ועוד' },
];

export default function Home({ plan }: { plan: TripPlan }) {
  const totals = calcTrip(plan);
  const { community, update } = useCommunity();
  const everything = allPlaces(community);
  const month = new Date().getMonth() + 1;
  const hot = hotNow(everything, month);
  const hotPreview = [...hot.festivalsNow, ...hot.hotspots].slice(0, 4);
  const checkInPlace = everything.find((p) => p.id === community.checkIn?.placeId);

  return (
    <>
      <section className="hero">
        <p className="hero-kicker">אחרי הצבא, לפני החיים 🎒</p>
        <h1>הטיול הגדול</h1>
        <p>כל מה שצריך לדעת – במקום אחד. בחרו לאן אתם טסים:</p>
      </section>

      {checkInPlace && (
        <div className="card here-banner">
          <a href={`#/map/${checkInPlace.id}`}>
            <strong>📍 אתם ב{checkInPlace.name}</strong>
            <span className="muted small">לחצו לראות על המפה</span>
          </a>
          <div className="here-actions">
            <button
              className="btn btn-small"
              onClick={() =>
                void shareText(`📍 אני עכשיו ב${checkInPlace.name} – מי בסביבה? 🎒`, `${location.origin}${location.pathname}#/map/${checkInPlace.id}`)
              }
            >
              שיתוף
            </button>
            <button className="btn btn-secondary btn-small" onClick={() => update((c) => ({ ...c, checkIn: null }))}>
              יצאתי
            </button>
          </div>
        </div>
      )}

      <a href="#/map" className="map-hero">
        <span className="map-hero-pins" aria-hidden="true">
          🚩 🎉 🍜 🏞️ 🇮🇱 🎊
        </span>
        <strong>🗺️ המפה של שביל החומוס</strong>
        <span>{everything.length} מקומות, פסטיבלים ואזהרות – עם ביקורות "בעין ישראלית"</span>
      </a>

      <div className="region-grid">
        {regions.map((r) => (
          <a key={r.id} href={`#/region/${r.id}`} className={`region-card region-${r.id}`}>
            <span className="region-emoji" aria-hidden="true">
              {r.emoji}
            </span>
            <span className="region-name">{r.name}</span>
            <span className="region-tagline">{r.tagline}</span>
            <span className="region-meta">{countriesByRegion(r.id).length} מדינות ←</span>
          </a>
        ))}
      </div>

      {plan.stops.length > 0 && (
        <a href="#/plan" className="card trip-summary">
          <strong>הטיול שלי</strong>
          <span>
            {plan.stops.length} מדינות · {formatDuration(totals.days)} · בערך {formatUsd(totals.totalUsd)}
          </span>
        </a>
      )}

      {hotPreview.length > 0 && (
        <>
          <h2 className="section-title">🔥 פופולרי בעונה זו ({monthNames[month - 1]})</h2>
          <ul className="hot-mini">
            {hotPreview.map((p) => (
              <li key={p.id}>
                <a href={`#/map/${p.id}`} className="card hot-mini-card" style={{ '--cat': categoryInfo[p.category].color } as React.CSSProperties}>
                  <span aria-hidden="true">{categoryInfo[p.category].emoji}</span>
                  <strong>{p.name}</strong>
                  <span className="muted small">{p.when ?? categoryInfo[p.category].label}</span>
                </a>
              </li>
            ))}
          </ul>
          <a href="#/hot" className="link small">
            עוד מה שפופולרי החודש ←
          </a>
        </>
      )}

      <h2 className="section-title">כלים לטיול</h2>
      <div className="quick-grid">
        {quickLinks.map((l) => (
          <a key={l.href} href={l.href} className="card quick-card">
            <span className="quick-icon" aria-hidden="true">
              {l.icon}
            </span>
            <strong>{l.title}</strong>
            <span className="muted">{l.desc}</span>
          </a>
        ))}
      </div>

      <p className="disclaimer">
        המידע באפליקציה כללי ומתעדכן מעת לעת. תנאי ויזה, מחירים ואזהרות מסע משתנים – תמיד בדקו מול המקורות הרשמיים לפני
        הטיסה.
      </p>
    </>
  );
}
