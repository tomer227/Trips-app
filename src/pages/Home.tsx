import { regions, countriesByRegion } from '../data/countries';
import { calcTrip, formatDuration, formatUsd, type TripPlan } from '../budget';

const quickLinks = [
  { href: '#/plan', icon: '🧭', title: 'תכנון ותקציב', desc: 'בנו מסלול וקבלו הערכת עלות' },
  { href: '#/journal', icon: '📔', title: 'יומן והוצאות', desc: 'זיכרונות ומעקב אחרי התקציב' },
  { href: '#/currency', icon: '💱', title: 'ממיר מטבע', desc: 'כמה זה בשקלים?' },
  { href: '#/checklist', icon: '🎒', title: 'מה לארוז', desc: 'צ׳קליסט שנשמר אצלכם' },
  { href: '#/tips', icon: '💡', title: 'טיפים חשובים', desc: 'כסף, בריאות, ביטוח ובטיחות' },
  { href: '#/phrases', icon: '💬', title: 'משפטים שימושיים', desc: 'ספרדית, תאילנדית, הינדית ועוד' },
];

export default function Home({ plan }: { plan: TripPlan }) {
  const totals = calcTrip(plan);

  return (
    <>
      <section className="hero">
        <p className="hero-kicker">אחרי הצבא, לפני החיים 🎒</p>
        <h1>הטיול הגדול</h1>
        <p>כל מה שצריך לדעת – במקום אחד. בחרו לאן אתם טסים:</p>
      </section>

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
