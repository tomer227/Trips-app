import { useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import CountrySelect from '../components/CountrySelect';
import MeetupSheet from '../components/MeetupSheet';
import { useAuth } from '../cloud/AuthContext';
import { useMeetups } from '../cloud/useMeetups';
import { cloudErrorText, localToday, validateMeetup, MEETUP_PLACE_MAX, MEETUP_TEXT_MAX, MEETUP_TITLE_MAX, type NewMeetup } from '../cloud/types';
import { getCountry } from '../data/countries';
import { places as curatedPlaces } from '../data/places';
import { getPosition } from '../geo';
import type { TripPlan } from '../budget';


/** Local date and time from the inputs, as an ISO instant. */
function toIso(date: string, time: string): string {
  const d = new Date(`${date}T${time || '00:00'}`);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

const localDay = (offsetDays = 0) => localToday(new Date(Date.now() + offsetDays * 86_400_000));

/**
 * "מפגשים": travellers pin a meetup at a public spot (Friday dinner, a hike, a night out). Signed-in
 * users see them here and on the map, and can say they are coming. Only a head count is shown.
 */
export default function MeetupsPage({ plan }: { plan: TripPlan }) {
  const { status } = useAuth();
  const { view, reload } = useMeetups();
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState('all');

  const header = (
    <PageHeader title="🙌 מפגשים" subtitle="ארוחת שישי, טרק ליום, יציאה בערב: קבעו מפגש במקום ציבורי, וישראלים באזור יראו אותו גם על המפה." back={{ href: '#/more', label: 'עוד' }} />
  );

  if (status !== 'in') {
    return (
      <>
        {header}
        <div className="card">
          {status === 'loading' && <p className="muted">טוען…</p>}
          {status === 'unconfigured' && <p>החשבונות עוד לא מחוברים באפליקציה, לכן המפגשים עוד לא פעילים.</p>}
          {status === 'out' && (
            <>
              <p>המפגשים פתוחים רק למטיילים מחוברים, כדי לשמור עליהם בטוחים.</p>
              <a className="btn btn-small" href="#/account">
                התחברות
              </a>
            </>
          )}
        </div>
      </>
    );
  }

  const meetups = view.state === 'ok' ? view.meetups : [];
  const countriesWith = [...new Set(meetups.map((m) => m.countryId))].filter((id) => getCountry(id));
  // A filter whose country no longer has meetups falls back to all (its chip is gone too).
  const activeFilter = countriesWith.includes(filter) && countriesWith.length > 1 ? filter : 'all';
  const shown = activeFilter === 'all' ? meetups : meetups.filter((m) => m.countryId === activeFilter);

  return (
    <>
      {header}
      {composing ? (
        <Composer defaultCountry={plan.stops[0]?.countryId ?? 'thailand'} onCancel={() => setComposing(false)} onDone={async () => { setComposing(false); await reload(); }} />
      ) : (
        <button className="btn btn-block" onClick={() => setComposing(true)}>
          + קביעת מפגש
        </button>
      )}

      {countriesWith.length > 1 && (
        <div className="chips" role="tablist" aria-label="סינון לפי מדינה">
          <button role="tab" aria-selected={activeFilter === 'all'} className={`chip${activeFilter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
            הכל
          </button>
          {countriesWith.map((id) => {
            const c = getCountry(id)!;
            return (
              <button key={id} role="tab" aria-selected={activeFilter === id} className={`chip${activeFilter === id ? ' active' : ''}`} onClick={() => setFilter(id)}>
                {c.flag} {c.name}
              </button>
            );
          })}
        </div>
      )}

      {view.state === 'loading' && <p className="muted">טוען…</p>}
      {view.state === 'error' && (
        <div className="card" role="alert">
          <p>לא הצלחנו לטעון את המפגשים.</p>
          <button className="btn btn-secondary btn-small" onClick={() => void reload()}>
            נסו שוב
          </button>
        </div>
      )}
      {view.state === 'ok' && shown.length === 0 && (
        <div className="card empty">
          <p>עוד אין מפגשים קרובים. קבעו אחד, ומי שבאזור יראה אותו.</p>
        </div>
      )}
      <ul className="meetup-list">
        {shown.map((m) => (
          <MeetupSheet key={m.id} meetup={m} onChanged={reload} inline />
        ))}
      </ul>

      <div className="card privacy-note">
        <strong>🔒 בטיחות ופרטיות</strong>
        <ul>
          <li>קבעו רק במקום ציבורי (בית חב״ד, בית קפה, נקודת יציאה לטרק), לא בחדר או בהוסטל שלכם.</li>
          <li>רואים רק כמה מגיעים, לא מי.</li>
          <li>מפגש נעלם 12 שעות אחרי שהתחיל. אפשר לדווח על מפגש לא ראוי.</li>
        </ul>
      </div>
    </>
  );
}

function Composer({ defaultCountry, onCancel, onDone }: { defaultCountry: string; onCancel: () => void; onDone: () => Promise<void> }) {
  const { backend } = useAuth();
  const [countryId, setCountryId] = useState(defaultCountry);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [placeLabel, setPlaceLabel] = useState('');
  const [date, setDate] = useState(localDay(1));
  const [time, setTime] = useState('19:00');
  const [point, setPoint] = useState<{ lat: number; lng: number; source: 'gps' | 'place' } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const known = useMemo(() => curatedPlaces.filter((p) => p.countryId === countryId && p.category !== 'warning'), [countryId]);

  const draft: NewMeetup = { countryId, title, text, placeLabel, lat: point?.lat ?? NaN, lng: point?.lng ?? NaN, startsAt: toIso(date, time) };
  const problem = validateMeetup(draft);

  const locate = async () => {
    setLocating(true);
    setError(null);
    const here = await getPosition();
    setLocating(false);
    if (here) setPoint({ ...here, source: 'gps' });
    else setError('לא הצלחנו לאתר מיקום. בחרו מקום מוכר מהרשימה.');
  };

  const publish = async () => {
    if (!backend || problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await backend.createMeetup(draft);
      await onDone();
    } catch (e) {
      setError(cloudErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card form-grid meetup-form">
      <label>
        <span>מה עושים?</span>
        <input type="text" maxLength={MEETUP_TITLE_MAX} placeholder="למשל: ארוחת שישי, טרק ליום, יציאה לבר" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="form-row">
        <label>
          <span>מדינה</span>
          <CountrySelect
            value={countryId}
            onChange={(id) => {
              setCountryId(id);
              setPoint(null);
            }}
          />
        </label>
        <label>
          <span>תאריך</span>
          <input type="date" min={localDay()} max={localDay(60)} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span>שעה</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <label>
        <span>איפה נפגשים? (מקום ציבורי)</span>
        <input type="text" maxLength={MEETUP_PLACE_MAX} placeholder="למשל: בית חב״ד, הכניסה לשוק" value={placeLabel} onChange={(e) => setPlaceLabel(e.target.value)} />
      </label>
      <div className="meetup-location">
        <span className="muted small">המיקום על המפה:</span>
        <button className="btn btn-secondary btn-small" onClick={() => void locate()} disabled={locating}>
          {locating ? 'מאתר…' : '📍 איפה שאני עכשיו'}
        </button>
        {known.length > 0 && (
          <select
            aria-label="מקום מוכר"
            value={point?.source === 'place' ? known.find((p) => p.lat === point.lat && p.lng === point.lng)?.id ?? '' : ''}
            onChange={(e) => {
              const p = known.find((k) => k.id === e.target.value);
              if (!p) return;
              setPoint({ lat: p.lat, lng: p.lng, source: 'place' });
              if (!placeLabel.trim()) setPlaceLabel(p.name.slice(0, MEETUP_PLACE_MAX));
            }}
          >
            <option value="">או בחרו מקום מוכר…</option>
            {known.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {point && <span className="small">✓ {point.source === 'gps' ? 'המיקום שלכם נקבע' : 'המקום נקבע'}</span>}
      </div>
      <label>
        <span>פרטים (לא חובה)</span>
        <textarea rows={3} maxLength={MEETUP_TEXT_MAX} placeholder="מה להביא, איך מזהים אתכם…" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <p className="muted small">בלי מספרי טלפון: מי שמגיע לוחץ "אני מגיע/ה", ונפגשים במקום.</p>
      {error && (
        <p className="status-line status-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="btn" onClick={() => void publish()} disabled={busy || !!problem}>
          פרסום המפגש
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          ביטול
        </button>
      </div>
      {problem && title && <p className="muted small">{problem}</p>}
    </div>
  );
}
