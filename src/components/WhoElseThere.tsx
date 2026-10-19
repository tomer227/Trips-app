import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../cloud/AuthContext';
import type { FellowTraveler } from '../cloud/types';
import { formatDateRange as range, stopWindows, type TripPlan } from '../budget';
import { getCountry } from '../data/countries';

interface Props {
  plan: TripPlan;
  setPlan: (update: (prev: TripPlan) => TripPlan) => void;
}

type Result = { state: 'idle' } | { state: 'loading' } | { state: 'error' } | { state: 'ok'; travelers: FellowTraveler[] };

/**
 * "מי עוד שם": travellers who opted in see who else will be in the same country at the same time.
 * Only the country and dates are shared, and only while the user shares their own.
 */
export default function WhoElseThere({ plan, setPlan }: Props) {
  const { status, backend } = useAuth();
  const windows = useMemo(() => stopWindows(plan), [plan]);
  const windowsKey = JSON.stringify(windows);
  const [result, setResult] = useState<Result>({ state: 'idle' });

  useEffect(() => {
    if (status !== 'in' || !backend) return;
    // undefined means the user never shared, so there is nothing to take down.
    if (plan.shareTrip === undefined) return;
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        if (!plan.shareTrip) {
          await backend.publishTrip([]);
          if (alive) setResult({ state: 'idle' });
          return;
        }
        if (alive) setResult({ state: 'loading' });
        await backend.publishTrip(windows);
        const travelers = await backend.whoElseThere();
        if (alive) setResult({ state: 'ok', travelers });
      } catch {
        if (alive) setResult({ state: 'error' });
      }
    }, 800);
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
  );
}
