import { useState } from 'react';
import { countries, getCountry, regions } from '../data/countries';
import type { TripPlan } from '../budget';
import { getPosition } from '../geo';
import { usePersistentState } from '../storage';
import {
  addDays,
  cities,
  formatDayHe,
  formatTime,
  getCity,
  hebrewCalendarSupported,
  holidayInfo,
  shabbatTimes,
  todayIn,
  upcomingFriday,
  upcomingHolidays,
  CANDLE_MINUTES,
  type City,
} from '../jewish';
import PageHeader from '../components/PageHeader';

type PlaceChoice = { kind: 'city'; id: string } | { kind: 'here'; lat: number; lng: number; tz: string };

const HERE_ID = 'here';

function resolvePlace(choice: PlaceChoice | null, fallbackCountry: string): City {
  if (choice?.kind === 'here') return { id: HERE_ID, countryId: '', name: 'המיקום שלי', lat: choice.lat, lng: choice.lng, tz: choice.tz };
  const byId = choice?.kind === 'city' ? getCity(choice.id) : undefined;
  return byId ?? cities.find((c) => c.countryId === fallbackCountry) ?? cities[0];
}

export default function ShabbatPage({ plan }: { plan: TripPlan }) {
  const [choice, setChoice] = usePersistentState<PlaceChoice | null>('shabbat-place', null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);
  const [allHolidays, setAllHolidays] = useState(false);
  const place = resolvePlace(choice, plan.stops[0]?.countryId ?? 'thailand');
  const country = getCountry(place.countryId);

  const today = todayIn(place.tz);
  const friday = upcomingFriday(today);
  const weeks = [0, 1, 2, 3].map((w) => shabbatTimes(addDays(friday, w * 7), place.lat, place.lng));
  const [next, ...later] = weeks;
  const holidays = hebrewCalendarSupported() ? upcomingHolidays(today, 365) : [];

  const locate = async () => {
    setLocating(true);
    setLocateError(false);
    const coords = await getPosition();
    setLocating(false);
    if (!coords) {
      setLocateError(true);
      return;
    }
    setChoice({ kind: 'here', ...coords, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
  };

  return (
    <>
      <PageHeader
        title="🕯️ שבת וחגים בדרך"
        subtitle="מתי נכנסת השבת איפה שאתם, מה החג הבא ואיפה חוגגים אותו בשביל – עובד גם בלי אינטרנט."
        back={{ href: '#/more', label: 'עוד' }}
      />

      <div className="card form-grid">
        <label>
          איפה אתם?
          <select
            value={place.id}
            onChange={(e) => (e.target.value === HERE_ID ? void locate() : setChoice({ kind: 'city', id: e.target.value }))}
          >
            {choice?.kind === 'here' && <option value={HERE_ID}>📍 המיקום שלי</option>}
            {regions.map((r) => (
              <optgroup key={r.id} label={r.name}>
                {countries
                  .filter((c) => c.region === r.id)
                  .flatMap((c) =>
                    cities
                      .filter((city) => city.countryId === c.id)
                      .map((city) => (
                        <option key={city.id} value={city.id}>
                          {c.flag} {city.name}
                        </option>
                      )),
                  )}
              </optgroup>
            ))}
          </select>
        </label>
        <button className="btn btn-secondary" onClick={() => void locate()} disabled={locating}>
          {locating ? 'מאתרים…' : '📍 לפי המיקום שלי'}
        </button>
        {locateError && <p className="small error-text">לא הצלחנו לאתר מיקום. בחרו את העיר הקרובה מהרשימה.</p>}
      </div>

      <div className="card shabbat-card">
        <span className="muted">שבת הקרובה · {place.name}</span>
        <span className="small muted">{formatDayHe(next.friday)}</span>
        <div className="shabbat-times">
          <div>
            <span>🕯️ הדלקת נרות</span>
            <strong>{next.candles === null ? '—' : formatTime(next.candles, place.tz)}</strong>
          </div>
          <div>
            <span>✨ צאת השבת</span>
            <strong>{next.havdalah === null ? '—' : formatTime(next.havdalah, place.tz)}</strong>
          </div>
        </div>
        <span className="small muted">השעות לפי השעון המקומי ב{place.name}</span>
      </div>

      <ul className="breakdown card shabbat-later">
        {later.map((w) => (
          <li key={w.friday}>
            <span>{formatDayHe(w.friday)}</span>
            <span>
              🕯️ {w.candles === null ? '—' : formatTime(w.candles, place.tz)} · ✨ {w.havdalah === null ? '—' : formatTime(w.havdalah, place.tz)}
            </span>
          </li>
        ))}
      </ul>

      {country && (
        <p className="small">
          {country.chabad ? (
            <>
              🏠 יש בית חב״ד ב{country.name} – ארוחות שבת פתוחות למטיילים, בדרך כלל עם הרשמה מראש.{' '}
              <a className="link" href={`#/country/${country.id}`}>
                עוד על {country.name} ←
              </a>
            </>
          ) : (
            <>אין בית חב״ד קבוע ב{country.name} (נכון לעדכון האחרון) – כדאי לשאול בקבוצות המטיילים על ארוחת שבת.</>
          )}
        </p>
      )}

      {holidays.length > 0 && (
        <>
          <h2 className="section-title">📅 החגים הקרובים</h2>
          <ul className="holiday-list">
            {(allHolidays ? holidays : holidays.slice(0, 5)).map((h) => {
              const info = holidayInfo[h.id];
              const soon = h.inDays <= 30;
              return (
                <li key={h.id + h.date} className={`card holiday${soon ? ' holiday-soon' : ''}`}>
                  <div className="holiday-head">
                    <span className="holiday-emoji" aria-hidden="true">
                      {info.emoji}
                    </span>
                    <span className="holiday-title">
                      <strong>{info.name}</strong>
                      <span className="muted small">
                        {formatDayHe(h.date)}
                        {h.hebrew && ` · ${h.hebrew}`}
                        {info.days > 1 && ` · ${info.days} ימים`}
                      </span>
                    </span>
                    <span className="pill">{whenLabel(h.inDays)}</span>
                  </div>
                  {info.eve && h.inDays > 0 && <span className="small muted">מתחיל בערב שלפני – {formatDayHe(addDays(h.date, -1))}</span>}
                  <span className="small">{info.onTheRoad}</span>
                </li>
              );
            })}
          </ul>
          {!allHolidays && holidays.length > 5 && (
            <button className="btn btn-secondary btn-block" onClick={() => setAllHolidays(true)}>
              כל החגים בשנה הקרובה ({holidays.length})
            </button>
          )}
        </>
      )}

      <p className="disclaimer">
        הזמנים מחושבים במכשיר לפי המיקום: הדלקת נרות {CANDLE_MINUTES} דקות לפני השקיעה, וצאת השבת כשהשמש 8.5° מתחת לאופק. יש מנהגים
        שונים – לזמנים מדויקים לפי המנהג שלכם שאלו בבית חב״ד המקומי. תאריכי החגים לפי הלוח העברי כפי שהוא נהוג בישראל.
      </p>
    </>
  );
}

function whenLabel(inDays: number): string {
  if (inDays < 0) return 'עכשיו';
  if (inDays === 0) return 'היום';
  if (inDays === 1) return 'מחר';
  if (inDays < 30) return `בעוד ${inDays} ימים`;
  const months = Math.round(inDays / 30);
  return months === 1 ? 'בעוד חודש' : months === 2 ? 'בעוד חודשיים' : `בעוד ${months} חודשים`;
}
