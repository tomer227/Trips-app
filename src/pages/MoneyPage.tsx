import { getCountry } from '../data/countries';
import { formatDuration, formatUsd, type TripPlan } from '../budget';
import { convert, formatMoney, useRates } from '../currency';
import { emptyJournal, formatDate, today, type Journal } from '../journal';
import { calcRunway, emptyMoney, RECENT_DAYS, type MoneySettings } from '../runway';
import { usePersistentState } from '../storage';
import PageHeader from '../components/PageHeader';

export default function MoneyPage({ plan }: { plan: TripPlan }) {
  const [money, setMoney] = usePersistentState<MoneySettings>('money', emptyMoney);
  const [journal] = usePersistentState<Journal>('journal', emptyJournal);
  const { rates } = useRates();

  const budgetUsd = money.currency === 'USD' ? money.amount : (convert(money.amount, 'ILS', 'USD', rates) ?? 0);
  const r = calcRunway({ budgetUsd, expenses: journal.expenses, plan, today: today(), startDate: money.startDate });
  const inChosen = (usd: number) => (money.currency === 'USD' ? formatUsd(usd) : formatMoney(convert(usd, 'USD', 'ILS', rates) ?? 0, 'ILS'));

  const maxDays = r.perCountry[0]?.days || 1;
  const cheapest = r.perCountry[0];
  const priciest = r.perCountry[r.perCountry.length - 1];
  const ratio = cheapest && priciest && priciest.days > 0 ? cheapest.days / priciest.days : null;

  return (
    <>
      <PageHeader
        title="⏳ כמה זמן הכסף יחזיק?"
        subtitle="מחברים את התקציב שלכם להוצאות שאתם רושמים ביומן – ומקבלים תחזית אמיתית, לא הערכה מלפני הטיסה."
        back={{ href: '#/more', label: 'עוד' }}
      />

      <div className="card form-grid">
        <label>
          כמה כסף יש לכם לטיול? (בלי טיסות שכבר שילמתם)
          <div className="form-row">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0"
              value={money.amount || ''}
              onChange={(e) => setMoney((m) => ({ ...m, amount: Math.max(0, Number(e.target.value) || 0) }))}
            />
            <select value={money.currency} onChange={(e) => setMoney((m) => ({ ...m, currency: e.target.value as MoneySettings['currency'] }))}>
              <option value="ILS">₪ שקלים</option>
              <option value="USD">$ דולרים</option>
            </select>
          </div>
        </label>
        <label>
          מתי התחיל הטיול? (לא חובה)
          <input type="date" value={money.startDate} onChange={(e) => setMoney((m) => ({ ...m, startDate: e.target.value }))} />
        </label>
      </div>

      {money.amount <= 0 ? (
        <p className="card muted">הכניסו את הסכום שיש לכם, ונראה לכם עד מתי הוא מספיק ואיפה הוא יחזיק הכי הרבה.</p>
      ) : (
        <>
          <div className="card totals">
            <div className="total-main">
              <span className="muted">הכסף יחזיק עוד</span>
              <strong className="big-number">{r.runwayDays === null ? '—' : formatDuration(r.runwayDays)}</strong>
              {r.outDate && <span className="muted">עד {formatDate(r.outDate)} בערך</span>}
            </div>
            <p className="small runway-source">
              {r.burnSource === 'actual'
                ? `לפי ההוצאות שרשמתם ביומן (ממוצע ${RECENT_DAYS} ימי ההוצאה האחרונים): ${formatUsd(r.burnPerDayUsd)} ליום`
                : r.burnSource === 'plan'
                  ? `לפי התקציב המתוכנן: ${formatUsd(r.burnPerDayUsd)} ליום. רשמו הוצאות ביומן כמה ימים – והתחזית תתבסס על מה שאתם מוציאים באמת.`
                  : 'הוסיפו מדינות ל"הטיול שלי" או רשמו הוצאות ביומן כדי לקבל תחזית.'}
            </p>
            <ul className="breakdown">
              <li>
                <span>התקציב</span>
                <span>{inChosen(r.budgetUsd)}</span>
              </li>
              <li>
                <span>הוצאתם עד עכשיו</span>
                <span>{inChosen(r.spentUsd)}</span>
              </li>
              <li>
                <span>נשאר</span>
                <strong>{inChosen(r.remainingUsd)}</strong>
              </li>
            </ul>
          </div>

          {r.diffDays !== null && r.plannedDaysLeft !== null && r.plannedDaysLeft > 0 && (
            <div className={`card runway-verdict ${r.diffDays >= 0 ? 'tone-good' : 'tone-bad'}`}>
              {r.diffDays >= 0 ? (
                <>
                  <strong>🎉 אתם בסדר!</strong>
                  <span>
                    לפי התכנון נשארו {formatDuration(r.plannedDaysLeft)}, והכסף מספיק ל־{formatDuration(r.diffDays)} נוספים אחרי זה.
                  </span>
                </>
              ) : (
                <>
                  <strong>⚠️ חסרים {formatDuration(-r.diffDays)}</strong>
                  <span>
                    כדי שהכסף יספיק עד סוף התכנון ({formatDuration(r.plannedDaysLeft)}) צריך לרדת ל־{formatUsd(r.neededPerDayUsd ?? 0)} ליום
                    {r.burnSource === 'actual' && ` (היום: ${formatUsd(r.burnPerDayUsd)})`}. או לבלות יותר זמן במדינה זולה יותר 👇
                  </span>
                </>
              )}
            </div>
          )}

          <h2 className="section-title">🌏 כמה זמן {inChosen(r.remainingUsd)} מחזיקים בכל מדינה</h2>
          {ratio && ratio >= 1.5 && cheapest && priciest && (
            <p className="small">
              חודש ב{getCountry(priciest.countryId)?.name} עולה כמו בערך {ratio.toFixed(1)} חודשים ב{getCountry(cheapest.countryId)?.name}.
            </p>
          )}
          <ul className="runway-bars card">
            {r.perCountry.map(({ countryId, days }) => {
              const c = getCountry(countryId);
              if (!c) return null;
              const inPlan = plan.stops.some((s) => s.countryId === countryId);
              return (
                <li key={countryId} className={inPlan ? 'in-plan' : undefined}>
                  <span className="runway-name">
                    {c.flag} {c.name}
                  </span>
                  <span className="runway-bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(2, (days / maxDays) * 100)}%` }} />
                  </span>
                  <span className="runway-days">{days >= 30 ? formatDuration(days).replace(/ ו־.*/, '') : `${days} ימים`}</span>
                </li>
              );
            })}
          </ul>
          <p className="small muted">
            לפי תקציב יומי {plan.style === 'low' ? 'חסכוני' : 'נוח'} לכל מדינה (אפשר לשנות ב"הטיול שלי"). מודגשות: המדינות שבתכנון שלכם.
          </p>
        </>
      )}

      <p className="disclaimer">
        התחזית היא הערכה: מחירים, שערי מטבע ועונות משתנים. הסכום נשמר רק במכשיר. ההוצאות נלקחות מהיומן –{' '}
        <a className="link" href="#/journal">
          לרישום הוצאות ←
        </a>
      </p>
    </>
  );
}
