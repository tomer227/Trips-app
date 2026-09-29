import { countries, getCountry, regions } from '../data/countries';
import { calcTrip, emptyPlan, formatDuration, formatUsd, type TravelStyle, type TripPlan } from '../budget';
import PageHeader from '../components/PageHeader';

interface Props {
  plan: TripPlan;
  setPlan: (update: (prev: TripPlan) => TripPlan) => void;
}

export default function PlanPage({ plan, setPlan }: Props) {
  const totals = calcTrip(plan);
  const available = countries.filter((c) => !plan.stops.some((s) => s.countryId === c.id));

  const updateDays = (index: number, days: number) =>
    setPlan((p) => ({ ...p, stops: p.stops.map((s, i) => (i === index ? { ...s, days: Math.max(1, days) } : s)) }));

  const move = (index: number, dir: -1 | 1) =>
    setPlan((p) => {
      const target = index + dir;
      if (target < 0 || target >= p.stops.length) return p;
      const stops = [...p.stops];
      [stops[index], stops[target]] = [stops[target], stops[index]];
      return { ...p, stops };
    });

  const remove = (index: number) => setPlan((p) => ({ ...p, stops: p.stops.filter((_, i) => i !== index) }));

  const add = (countryId: string) => {
    const country = getCountry(countryId);
    if (!country) return;
    setPlan((p) => ({ ...p, stops: [...p.stops, { countryId, days: country.suggestedDays }] }));
  };

  const setNumber = (field: 'flightsUsd' | 'insurancePerMonthUsd', value: string) =>
    setPlan((p) => ({ ...p, [field]: Math.max(0, Number(value) || 0) }));

  const reset = () => {
    if (window.confirm('למחוק את כל התכנון ולהתחיל מחדש?')) setPlan(() => emptyPlan);
  };

  return (
    <>
      <PageHeader title="🧭 הטיול שלי" subtitle="בנו את המסלול, סדרו את הימים וקבלו הערכת תקציב. הכל נשמר אוטומטית במכשיר." />

      <div className="card totals">
        <div className="total-main">
          <span className="muted">תקציב משוער</span>
          <strong className="big-number">{formatUsd(totals.totalUsd)}</strong>
          <span className="muted">{totals.days > 0 ? formatDuration(totals.days) : 'עוד לא הוספתם מדינות'}</span>
        </div>
        {totals.days > 0 && (
          <ul className="breakdown">
            <li>
              <span>מחיה בשטח</span>
              <span>{formatUsd(totals.livingUsd)}</span>
            </li>
            <li>
              <span>טיסות</span>
              <span>{formatUsd(plan.flightsUsd)}</span>
            </li>
            <li>
              <span>ביטוח ({Math.ceil(totals.months)} חודשים)</span>
              <span>{formatUsd(totals.insuranceUsd)}</span>
            </li>
            <li>
              <span>ממוצע לחודש (מחיה)</span>
              <span>{formatUsd((totals.livingUsd / totals.days) * 30)}</span>
            </li>
          </ul>
        )}
      </div>

      <div className="segmented" role="radiogroup" aria-label="סגנון טיול">
        {(
          [
            ['low', '🎒 חסכוני', 'הוסטלים, אוכל רחוב, תחבורה ציבורית'],
            ['comfortable', '🛏️ נוח', 'חדרים פרטיים, קצת יותר אטרקציות'],
          ] as [TravelStyle, string, string][]
        ).map(([value, label, desc]) => (
          <button
            key={value}
            role="radio"
            aria-checked={plan.style === value}
            className={plan.style === value ? 'active' : undefined}
            onClick={() => setPlan((p) => ({ ...p, style: value }))}
          >
            <strong>{label}</strong>
            <span>{desc}</span>
          </button>
        ))}
      </div>

      <h2 className="section-title">המסלול</h2>
      {plan.stops.length === 0 ? (
        <div className="card empty">
          <p>המסלול ריק. הוסיפו מדינה מהרשימה למטה, או היכנסו לעמוד של מדינה ולחצו "הוסיפו לטיול".</p>
        </div>
      ) : (
        <ol className="stops">
          {plan.stops.map((stop, i) => {
            const c = getCountry(stop.countryId);
            if (!c) return null;
            const cost = totals.perStop[i]?.costUsd ?? 0;
            return (
              <li key={stop.countryId} className="card stop">
                <span className="stop-num">{i + 1}</span>
                <a className="stop-name" href={`#/country/${c.id}`}>
                  {c.flag} {c.name}
                  <span className="muted">{formatUsd(cost)}</span>
                </a>
                <div className="stepper" aria-label={`ימים ב${c.name}`}>
                  <button onClick={() => updateDays(i, stop.days - 1)} aria-label="פחות יום">
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={stop.days}
                    onChange={(e) => updateDays(i, Number(e.target.value) || 1)}
                    aria-label="מספר ימים"
                  />
                  <button onClick={() => updateDays(i, stop.days + 1)} aria-label="עוד יום">
                    +
                  </button>
                </div>
                <div className="stop-actions">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="הזזה למעלה">
                    ▲
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === plan.stops.length - 1} aria-label="הזזה למטה">
                    ▼
                  </button>
                  <button onClick={() => remove(i)} aria-label={`הסרת ${c.name}`}>
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {available.length > 0 && (
        <label className="add-select">
          <span>+ הוספת מדינה</span>
          <select value="" onChange={(e) => add(e.target.value)}>
            <option value="" disabled>
              בחרו מדינה…
            </option>
            {regions.map((r) => (
              <optgroup key={r.id} label={r.name}>
                {available
                  .filter((c) => c.region === r.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.flag} {c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}

      <h2 className="section-title">הוצאות נוספות</h2>
      <div className="card form-grid">
        <label>
          <span>✈️ טיסות (הלוך וחזור + פנימיות)</span>
          <input type="number" inputMode="numeric" min={0} value={plan.flightsUsd} onChange={(e) => setNumber('flightsUsd', e.target.value)} />
        </label>
        <label>
          <span>🛡️ ביטוח לחודש</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={plan.insurancePerMonthUsd}
            onChange={(e) => setNumber('insurancePerMonthUsd', e.target.value)}
          />
        </label>
        <p className="muted small">הסכומים בדולרים. התקציב היומי כולל לינה, אוכל ותחבורה מקומית – לא טרקים מאורגנים, צלילה או טיסות פנימיות.</p>
      </div>

      {plan.stops.length > 0 && (
        <button className="btn btn-danger" onClick={reset}>
          איפוס התכנון
        </button>
      )}
    </>
  );
}
