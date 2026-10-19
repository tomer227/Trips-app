import { useState } from 'react';
import { countries, getCountry } from '../data/countries';
import type { TripPlan } from '../budget';
import { allPlaces, shareText, useCommunity } from '../community';
import { today } from '../journal';
import { getPosition } from '../geo';
import { usePersistentState } from '../storage';
import {
  backMessage,
  daysSince,
  emptySafety,
  formatIsoDate,
  MFA_EMERGENCY,
  normalizePhone,
  okMessage,
  parseEmergency,
  telHref,
  trekMessage,
  trekStatus,
  whatsappUrl,
  addDaysIso,
  type SafetyProfile,
  type SafetyState,
  type TrekPlan,
  type TrekStatus,
} from '../safety';
import PageHeader from '../components/PageHeader';
import CountrySelect from '../components/CountrySelect';

const statusText: Record<TrekStatus, { label: string; tone: string }> = {
  upcoming: { label: '🗓️ עוד לא יצאתם', tone: 'info' },
  'on-trail': { label: '🥾 בדרך', tone: 'good' },
  late: { label: '⏰ עבר תאריך החזרה – שלחו "חזרתי"', tone: 'warn' },
  overdue: { label: '🚨 עבר המועד שנתתם למשפחה', tone: 'bad' },
};

/** The country the traveller is most likely in right now. */
function useCurrentCountry(plan: TripPlan): string {
  const { community } = useCommunity();
  const here = allPlaces(community).find((p) => p.id === community.checkIn?.placeId);
  return here?.countryId ?? plan.stops[0]?.countryId ?? countries[0].id;
}

export default function SafetyPage({ plan }: { plan: TripPlan }) {
  const [state, setState] = usePersistentState<SafetyState>('safety', emptySafety);
  const currentCountry = useCurrentCountry(plan);
  const [showSettings, setShowSettings] = useState(!state.profile.contactPhone);
  const { profile } = state;

  const send = (text: string) => {
    if (normalizePhone(profile.contactPhone)) window.open(whatsappUrl(profile.contactPhone, text), '_blank', 'noopener');
    else void shareText(text);
  };

  return (
    <>
      <PageHeader
        title="🛟 רשת ביטחון"
        subtitle="המשפחה רגועה, ואתם חופשיים. בלי מעקב GPS – נשלח רק מה שאתם בוחרים לשלוח."
        back={{ href: '#/more', label: 'עוד' }}
      />

      <OkCard state={state} setState={setState} countryId={currentCountry} send={send} />
      <TrekCard state={state} setState={setState} countryId={currentCountry} send={send} />
      <EmergencyCard profile={profile} initialCountry={currentCountry} />

      <h2 className="section-title">⚙️ למי שולחים ומה הפרטים</h2>
      {showSettings ? (
        <SettingsForm
          state={state}
          onSave={(next) => {
            setState(next);
            setShowSettings(false);
          }}
        />
      ) : (
        <div className="card feature-row">
          <span>
            {profile.contactName || 'איש קשר'} · <bdi dir="ltr">{profile.contactPhone || '—'}</bdi>
            {profile.insuranceCompany && <span className="muted small"> · ביטוח: {profile.insuranceCompany}</span>}
          </span>
          <button className="btn btn-secondary btn-small" onClick={() => setShowSettings(true)}>
            עריכה
          </button>
        </div>
      )}

      <p className="disclaimer">
        🔒 כל הפרטים כאן נשמרים רק במכשיר שלכם ולא עולים לשום שרת. ההודעות יוצאות רק כשאתם לוחצים, דרך הוואטסאפ שלכם. בחירום
        אמיתי – התקשרו קודם למספר החירום המקומי.
      </p>
    </>
  );
}

interface CardProps {
  state: SafetyState;
  setState: (update: (prev: SafetyState) => SafetyState) => void;
  countryId: string;
  send: (text: string) => void;
}

function OkCard({ state, setState, countryId, send }: CardProps) {
  const [note, setNote] = useState('');
  const [withLocation, setWithLocation] = usePersistentState('safety-with-location', true);
  const [busy, setBusy] = useState(false);
  const since = daysSince(state.lastOkAt, Date.now());

  const sendOk = async () => {
    setBusy(true);
    const coords = withLocation ? await getPosition() : null;
    setBusy(false);
    const country = getCountry(countryId);
    send(okMessage({ place: country?.name, coords, note, now: Date.now() }));
    setState((s) => ({ ...s, lastOkAt: Date.now() }));
    setNote('');
  };

  return (
    <div className="card ok-card">
      <button className="btn ok-button" onClick={() => void sendOk()} disabled={busy}>
        {busy ? '📍 מאתרים מיקום…' : '💚 אני בסדר'}
      </button>
      <p className="muted small center">
        {since === null
          ? 'הודעה אחת בכמה ימים, וההורים ישנים בשקט.'
          : since === 0
            ? 'שלחתם היום ✓'
            : `שלחתם לאחרונה לפני ${since === 1 ? 'יום' : `${since} ימים`}`}
      </p>
      <input type="text" placeholder="משהו להוסיף? (לא חובה) – למשל: מחר עולים לטרק" value={note} onChange={(e) => setNote(e.target.value)} />
      <label className="check-line">
        <input type="checkbox" checked={withLocation} onChange={(e) => setWithLocation(e.target.checked)} />
        <span>לצרף קישור למיקום שלי</span>
      </label>
    </div>
  );
}

function TrekCard({ state, setState, countryId, send }: CardProps) {
  const [editing, setEditing] = useState(false);
  const trek = state.trek;
  const country = getCountry(trek?.countryId ?? countryId);

  if (!trek || editing) {
    return (
      <>
        <h2 className="section-title">🥾 יוצאים לטרק?</h2>
        <TrekForm
          initial={trek}
          countryId={countryId}
          onCancel={trek ? () => setEditing(false) : undefined}
          onSave={(next) => {
            setState((s) => ({ ...s, trek: next }));
            setEditing(false);
            const c = getCountry(next.countryId);
            send(trekMessage(next, state.profile, c?.name ?? '', c?.emergency ?? ''));
          }}
        />
      </>
    );
  }

  const status = trekStatus(trek, today());
  return (
    <>
      <h2 className="section-title">🥾 הטרק שלכם</h2>
      <div className={`card trek-card tone-${statusText[status].tone}`}>
        <strong>
          {trek.name} {country && `· ${country.flag} ${country.name}`}
        </strong>
        <span className="status-badge">{statusText[status].label}</span>
        <span className="small">
          {formatIsoDate(trek.startDate)} – {formatIsoDate(trek.returnDate)} · המשפחה תדאג אם לא תכתבו עד {formatIsoDate(addDaysIso(trek.returnDate, 1))} בערב
        </span>
        <div className="form-actions">
          <button
            className="btn"
            onClick={() => {
              send(backMessage(trek));
              setState((s) => ({ ...s, trek: null, lastOkAt: Date.now() }));
            }}
          >
            ✅ חזרתי בשלום
          </button>
          <button className="btn btn-secondary" onClick={() => setEditing(true)}>
            ✏️ שינוי תאריכים
          </button>
        </div>
        <button className="link small link-btn" onClick={() => send(trekMessage(trek, state.profile, country?.name ?? '', country?.emergency ?? ''))}>
          שליחת פרטי הטרק שוב
        </button>
      </div>
    </>
  );
}

function TrekForm({
  initial,
  countryId,
  onSave,
  onCancel,
}: {
  initial: TrekPlan | null;
  countryId: string;
  onSave: (t: TrekPlan) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<TrekPlan>(
    initial ?? { name: '', countryId, startDate: today(), returnDate: addDaysIso(today(), 3), route: '', companions: '' },
  );
  const valid = draft.name.trim() && draft.startDate && draft.returnDate >= draft.startDate;

  return (
    <form
      className="card form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ ...draft, name: draft.name.trim() });
      }}
    >
      <p className="muted small">ממלאים דקה לפני היציאה, והמשפחה מקבלת בוואטסאפ לאן הלכתם, עם מי, מתי תחזרו – ולמי להתקשר אם לא שמעו מכם.</p>
      <label>
        שם הטרק
        <input type="text" placeholder="למשל: סנטה קרוז, אנפורנה, טורס דל פיינה" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      <label>
        מדינה
        <CountrySelect value={draft.countryId} onChange={(id) => setDraft({ ...draft, countryId: id })} />
      </label>
      <div className="form-row">
        <label>
          יציאה
          <input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
        </label>
        <label>
          חזרה מתוכננת
          <input type="date" value={draft.returnDate} min={draft.startDate} onChange={(e) => setDraft({ ...draft, returnDate: e.target.value })} />
        </label>
      </div>
      <label>
        מסלול (לא חובה)
        <input type="text" placeholder="נקודת התחלה, סוף, איפה ישנים" value={draft.route} onChange={(e) => setDraft({ ...draft, route: e.target.value })} />
      </label>
      <label>
        עם מי (לא חובה)
        <input type="text" placeholder="שמות החברים, מדריך, סוכנות" value={draft.companions} onChange={(e) => setDraft({ ...draft, companions: e.target.value })} />
      </label>
      <div className="form-actions">
        <button className="btn" type="submit" disabled={!valid}>
          📤 שמירה ושליחה למשפחה
        </button>
        {onCancel && (
          <button className="btn btn-secondary" type="button" onClick={onCancel}>
            ביטול
          </button>
        )}
      </div>
    </form>
  );
}

function EmergencyCard({ profile, initialCountry }: { profile: SafetyProfile; initialCountry: string }) {
  const [countryId, setCountryId] = useState(initialCountry);
  const country = getCountry(countryId);
  const numbers = country ? parseEmergency(country.emergency) : [];

  const cardText = () =>
    [
      `🆘 כרטיס חירום – ${country?.name ?? ''}`,
      ...numbers.map((n) => `${n.label}: ${n.number}`),
      `חדר המצב של משרד החוץ: ${MFA_EMERGENCY}`,
      profile.insurancePhone && `ביטוח${profile.insuranceCompany ? ` (${profile.insuranceCompany})` : ''}: ${profile.insurancePhone}${profile.policyNumber ? ` · פוליסה ${profile.policyNumber}` : ''}`,
      profile.bloodType && `סוג דם: ${profile.bloodType}`,
      profile.medical && `רפואי: ${profile.medical}`,
    ]
      .filter(Boolean)
      .join('\n');

  return (
    <>
      <h2 className="section-title">🆘 כרטיס חירום</h2>
      <div className="card form-grid">
        <CountrySelect value={countryId} onChange={setCountryId} />
        <ul className="sos-list">
          {numbers.map((n) => (
            <li key={n.label + n.number}>
              <a className="sos-call" href={telHref(n.number)}>
                <span>{n.label}</span>
                <strong dir="ltr">📞 {n.number}</strong>
              </a>
            </li>
          ))}
          <li>
            <a className="sos-call" href={telHref(MFA_EMERGENCY)}>
              <span>חדר המצב של משרד החוץ (24/7)</span>
              <strong dir="ltr">📞 {MFA_EMERGENCY}</strong>
            </a>
          </li>
          {profile.insurancePhone && (
            <li>
              <a className="sos-call" href={telHref(profile.insurancePhone)}>
                <span>
                  מוקד הביטוח{profile.insuranceCompany && ` · ${profile.insuranceCompany}`}
                  {profile.policyNumber && <span className="muted small"> · פוליסה {profile.policyNumber}</span>}
                </span>
                <strong dir="ltr">📞 {profile.insurancePhone}</strong>
              </a>
            </li>
          )}
        </ul>
        {(profile.bloodType || profile.medical) && (
          <p className="small">
            {profile.bloodType && <>🩸 סוג דם: <bdi dir="ltr"><strong>{profile.bloodType}</strong></bdi> </>}
            {profile.medical && <>· 💊 {profile.medical}</>}
          </p>
        )}
        {country?.chabad && (
          <p className="small">
            🕯️ יש בית חב״ד ב{country.name} – בכל בעיה (רפואה, כסף, דרכון אבוד) הם הכתובת הראשונה בשטח.
          </p>
        )}
        <button className="btn btn-secondary" onClick={() => void shareText(cardText())}>
          📤 שיתוף הכרטיס לחבר לטיול
        </button>
        <p className="unverified">⚠️ המספרים נכתבו לפי ידע כללי ולא אומתו מול מקור רשמי. בדקו באתר משרד החוץ או באפליקציית TravIL.</p>
      </div>
    </>
  );
}

function SettingsForm({ state, onSave }: { state: SafetyState; onSave: (s: SafetyState) => void }) {
  const [draft, setDraft] = useState<SafetyProfile>(state.profile);
  const [every, setEvery] = useState(state.remindEveryDays);
  const set = (field: keyof SafetyProfile) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [field]: e.target.value });
  const phoneOk = !draft.contactPhone.trim() || normalizePhone(draft.contactPhone) !== null;

  return (
    <form
      className="card form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        if (phoneOk) onSave({ ...state, profile: draft, remindEveryDays: every });
      }}
    >
      <div className="form-row">
        <label>
          למי שולחים
          <input type="text" placeholder="אמא, אבא, אחות…" value={draft.contactName} onChange={set('contactName')} />
        </label>
        <label>
          טלפון (וואטסאפ)
          <input type="tel" dir="ltr" inputMode="tel" placeholder="050-0000000" value={draft.contactPhone} onChange={set('contactPhone')} />
        </label>
      </div>
      {!phoneOk && <p className="small error-text">המספר לא נראה תקין. אפשר לכתוב 05X או מספר עם קידומת +.</p>}
      <label>
        תזכורת לשלוח "אני בסדר"
        <select value={every} onChange={(e) => setEvery(Number(e.target.value))}>
          <option value={1}>כל יום</option>
          <option value={2}>כל יומיים</option>
          <option value={3}>כל 3 ימים</option>
          <option value={7}>פעם בשבוע</option>
          <option value={0}>בלי תזכורת</option>
        </select>
      </label>
      <div className="form-row">
        <label>
          חברת ביטוח
          <input type="text" placeholder="שם החברה" value={draft.insuranceCompany} onChange={set('insuranceCompany')} />
        </label>
        <label>
          מוקד הביטוח בחו״ל
          <input type="tel" dir="ltr" inputMode="tel" placeholder="+972-…" value={draft.insurancePhone} onChange={set('insurancePhone')} />
        </label>
      </div>
      <div className="form-row">
        <label>
          מספר פוליסה
          <input type="text" dir="ltr" value={draft.policyNumber} onChange={set('policyNumber')} />
        </label>
        <label>
          סוג דם
          <input type="text" dir="ltr" placeholder="A+" value={draft.bloodType} onChange={set('bloodType')} />
        </label>
      </div>
      <label>
        רגישויות ותרופות (לא חובה)
        <input type="text" placeholder="למשל: אלרגיה לפניצילין" value={draft.medical} onChange={set('medical')} />
      </label>
      <button className="btn" type="submit" disabled={!phoneOk}>
        שמירה
      </button>
    </form>
  );
}
