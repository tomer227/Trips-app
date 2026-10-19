import { useState } from 'react';
import { regions, countriesByRegion } from '../data/countries';
import { formatUsd } from '../budget';
import PageHeader from '../components/PageHeader';

export default function RegionPage({ regionId }: { regionId: string }) {
  const [query, setQuery] = useState('');
  const region = regions.find((r) => r.id === regionId);
  if (!region) return <NotFound />;

  const q = query.trim();
  const list = countriesByRegion(region.id).filter(
    (c) => !q || c.name.includes(q) || c.highlights.some((h) => h.name.includes(q)),
  );

  return (
    <>
      <PageHeader title={`${region.emoji} ${region.name}`} subtitle={region.intro} back={{ href: '#/', label: 'בית' }} />

      <div className="card route-card">
        <div className="route-head">
          <strong>המסלול הקלאסי</strong>
          <span className="pill">{region.recommendedLength}</span>
        </div>
        <ol className="route">
          {region.classicRoute.map((stop) => (
            <li key={stop}>{stop}</li>
          ))}
        </ol>
      </div>

      <input
        className="search"
        type="search"
        placeholder="חיפוש מדינה או מקום (למשל: קוסקו)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="חיפוש"
      />

      <ul className="country-list">
        {list.map((c) => (
          <li key={c.id}>
            <a href={`#/country/${c.id}`} className="card country-card">
              <span className="flag" aria-hidden="true">
                {c.flag}
              </span>
              <span className="country-text">
                <strong>{c.name}</strong>
                <span className="muted">{c.vibe}</span>
                <span className="tags">
                  <span className="pill">💵 {formatUsd(c.dailyBudget[0])}–{formatUsd(c.dailyBudget[1])} ליום</span>
                  {c.chabad && <span className="pill">🕯️ חב״ד</span>}
                </span>
              </span>
              <span className="chevron" aria-hidden="true">
                ‹
              </span>
            </a>
          </li>
        ))}
        {list.length === 0 && <li className="empty">לא נמצאו תוצאות ל״{q}״</li>}
      </ul>
    </>
  );
}

function NotFound() {
  return <PageHeader title="לא מצאנו את העמוד" back={{ href: '#/', label: 'חזרה לבית' }} />;
}
