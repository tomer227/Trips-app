import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../cloud/AuthContext';
import { CloudError, type FellowTraveler } from '../cloud/types';
import { formatDateRange as range, stopWindows, type TripPlan } from '../budget';
import { getCountry } from '../data/countries';

interface Props {
  plan: TripPlan;
  setPlan: (update: (prev: TripPlan) => TripPlan) => void;
}

type Result = { state: 'idle' } | { state: 'loading' } | { state: 'error' } | { state: 'ok'; travelers: FellowTraveler[]; stale?: boolean };

// The database allows a limited number of real trip changes a day, so the trip is published only
// after editing has paused for a while, and only when it differs from what was last published.
const PUBLISH_DELAY_MS = 4000;
const LAST_PUBLISHED_KEY = 'who-else-published';
const readLast = () => {
  try {
    return localStorage.getItem(LAST_PUBLISHED_KEY);
  } catch {
    return null;
  }
};
const writeLast = (value: string) => {
  try {
    localStorage.setItem(LAST_PUBLISHED_KEY, value);
  } catch {
    // Private mode: publishing again next time is harmless.
  }
};

/**
 * "מי עוד שם": travellers who opted in see who else will be in the same country at the same time.
 * Only the country and dates are shared, and only while the user shares their own.
 */
export default function WhoElseThere({ plan, setPlan }: Props) {
  const { status, backend, user } = useAuth();
  const windows = useMemo(() => stopWindows(plan), [plan]);
  const windowsKey = JSON.stringify(windows);
  const [result, setResult] = useState<Result>({ state: 'idle' });

  useEffect(() => {
    if (status !== 'in' || !backend) return;
    // undefined means the user never shared, so there is nothing to take down.
    if (plan.shareTrip === undefined) return;
    let alive = true;
    const wanted = plan.shareTrip ? windowsKey : '[]';
    const changed = readLast() !== `${user?.id}|${wanted}`;
    const timer = setTimeout(
      async () => {
        let stale = false;
        try {
          if (changed) {
            try {
              await backend.publishTrip(plan.shareTrip ? windows : []);
              writeLast(`${user?.id}|${wanted}`);
            } catch (e) {
              // Over today's change limit or not accepted: keep showing matches for the dates
              // published before, and say so.
              if (!(e instanceof CloudError) || (e.code !== 'rate_limited' && e.code !== 'invalid_input')) throw e;
              stale = true;
            }
          }
          if (!plan.shareTrip) {
            if (alive) setResult({ state: 'idle' });
            return;
          }
          if (alive) setResult((r) => (r.state === 'ok' ? r : { state: 'loading' }));
          const travelers = await backend.whoElseThere();
          if (alive) setResult({ state: 'ok', travelers, stale });
        } catch {
          if (alive) setResult({ state: 'error' });
        }
      },
      changed ? PUBLISH_DELAY_MS : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // windowsKey stands in for windows, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, backend, plan.shareTrip, windowsKey]);

  return (
    <>
      <h2 className="section-title">👋 מי עוד שם</h2>
      <div className="card who-else">
        <p className="muted">ראו אילו ישראלים יהיו באותה מדינה באותם תאריכים, כדי להיפגש, לחלוק נסיעה או לצאת יחד לטרק.</p>
        {status === 'loading' && <p className="muted">טוען…</p>}
        {status === 'unconfigured' && <p>החשבונות עוד לא מחוברים באפליקציה, לכן אי אפשר עדיין לראות מטיילים אחרים.</p>}
        {status === 'out' && (
          <>
            <p>כדי לראות מי עוד יהיה ביעדים שלכם צריך להתחבר לחשבון.</p>
            <a className="btn btn-small" href="#/account">
              התחברות
            </a>
          </>
        )}
        {status === 'in' && windows.length === 0 && <p>הוסיפו מדינות ובחרו תאריך יציאה למעלה, ואז תוכלו לראות מי עוד יהיה שם.</p>}
        {status === 'in' && windows.length > 0 && (
          <>
            <label className="switch">
              <input type="checkbox" checked={!!plan.shareTrip} onChange={(e) => setPlan((p) => ({ ...p, shareTrip: e.target.checked }))} />
              <span>להופיע ב"מי עוד שם"</span>
            </label>
            <p className="muted small">אחרים יראו רק את השם שלכם, את המדינה ואת התאריכים. לא עיר ולא מיקום. אפשר לבטל בכל רגע.</p>
            {plan.shareTrip && <Matches windows={windows} result={result} />}
          </>
        )}
      </div>
    </>
  );
}

function Matches({ windows, result }: { windows: ReturnType<typeof stopWindows>; result: Result }) {
  if (result.state === 'loading' || result.state === 'idle') return <p className="muted">מחפש מטיילים…</p>;
  if (result.state === 'error') return <p>לא הצלחנו לבדוק עכשיו. בדקו את החיבור לאינטרנט ונסו שוב.</p>;

  return (
    <>
      {result.stale && (
        <p className="muted small">שיניתם את המסלול הרבה פעמים היום, לכן התאריכים החדשים יתעדכנו מחר. בינתיים מוצגות ההתאמות לפי התאריכים הקודמים.</p>
      )}
      <ul className="who-list">
        {windows.map((w) => {
          const c = getCountry(w.countryId);
          if (!c) return null;
          const here = result.travelers.filter((t) => t.countryId === w.countryId && t.from <= w.to && w.from <= t.to);
          return (
            <li key={w.countryId}>
              <div className="who-head">
                <strong>
                  {c.flag} {c.name}
                </strong>
                <span className="muted small">{range(w.from, w.to)}</span>
              </div>
              {here.length === 0 ? (
                <p className="muted small">עוד אין מטיילים בתאריכים האלה. כשמישהו יצטרף, הוא יופיע כאן.</p>
              ) : (
                <>
                  <p className="who-count">{here.length === 1 ? 'עוד ישראלי אחד יהיה שם בזמן הזה' : `עוד ${here.length} ישראלים יהיו שם בזמן הזה`}</p>
                  <ul className="tags">
                    {here.map((t, i) => (
                      <li key={`${t.name}-${t.from}-${i}`} className="tag">
                        {t.name} · {range(t.from, t.to)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
