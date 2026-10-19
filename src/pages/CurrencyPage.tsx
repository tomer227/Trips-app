import { useEffect } from 'react';
import { convert, currencyCodes, currencyNames, formatMoney, useRates } from '../currency';
import { getCountry } from '../data/countries';
import type { TripPlan } from '../budget';
import { usePersistentState } from '../storage';
import PageHeader from '../components/PageHeader';

interface Props {
  initialCode?: string;
  plan: TripPlan;
}

interface ConverterState {
  amount: number;
  from: string;
}

export default function CurrencyPage({ initialCode, plan }: Props) {
  const { rates, updatedAt, source, loading, error, refresh } = useRates();
  const [state, setState] = usePersistentState<ConverterState>('converter', { amount: 100, from: 'THB' });
  const set = (patch: Partial<ConverterState>) => setState((s) => ({ ...s, ...patch }));

  // Arriving from a country page (#/currency/THB) preselects that currency once.
  useEffect(() => {
    if (initialCode && currencyNames[initialCode]) setState((s) => ({ ...s, from: initialCode }));
  }, [initialCode, setState]);

  // Show the traveller's home currency first, then the currencies of the countries in their trip.
  const tripCodes = plan.stops.map((s) => getCountry(s.countryId)?.currencyCode).filter((c): c is string => !!c);
  const targets = [...new Set(['ILS', 'USD', ...tripCodes, 'EUR'])].filter((c) => c !== state.from);

  const fromInfo = currencyNames[state.from];
  const quickAmounts = quickSteps(state.from, rates);

  return (
    <>
      <PageHeader title="💱 ממיר מטבע" subtitle="כמה זה בשקלים? הקלידו סכום ובחרו מטבע." back={{ href: '#/more', label: 'עוד' }} />

      <div className="card converter">
        <label className="converter-row">
          <span className="sr-only">סכום</span>
          <input
            className="amount-input"
            type="number"
            inputMode="decimal"
            min={0}
            value={Number.isFinite(state.amount) ? state.amount : ''}
            onChange={(e) => set({ amount: Math.max(0, Number(e.target.value)) })}
            aria-label="סכום"
          />
          <select value={state.from} onChange={(e) => set({ from: e.target.value })} aria-label="מטבע מקור">
            {currencyCodes.map((c) => (
              <option key={c} value={c}>
                {currencyNames[c].flag} {c} – {currencyNames[c].name}
              </option>
            ))}
          </select>
        </label>

        <ul className="conversions">
          {targets.map((code) => {
            const value = convert(state.amount || 0, state.from, code, rates);
            return (
              <li key={code} className={code === 'ILS' ? 'primary' : undefined}>
                <span>
                  {currencyNames[code].flag} {currencyNames[code].name}
                </span>
                <strong dir="ltr">{value === null ? '—' : formatMoney(value, code)}</strong>
              </li>
            );
          })}
        </ul>
      </div>

      {fromInfo && state.from !== 'ILS' && (
        <>
          <h2 className="section-title">טבלה מהירה – {fromInfo.name}</h2>
          <div className="card">
            <table className="cheat-sheet">
              <thead>
                <tr>
                  <th>{state.from}</th>
                  <th>₪ שקל</th>
                  <th>$ דולר</th>
                </tr>
              </thead>
              <tbody>
                {quickAmounts.map((n) => (
                  <tr key={n}>
                    <td dir="ltr">{formatMoney(n, state.from)}</td>
                    <td dir="ltr">{formatMoney(convert(n, state.from, 'ILS', rates) ?? 0, 'ILS')}</td>
                    <td dir="ltr">{formatMoney(convert(n, state.from, 'USD', rates) ?? 0, 'USD')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">טיפ: צלמו את הטבלה למסך – נוח במיוחד בשווקים ובמיקוח.</p>
          </div>
        </>
      )}

      <div className={`rates-status ${source === 'fallback' ? 'warn' : ''}`}>
        <span>
          {source === 'live' && '🟢 שערים עדכניים'}
          {source === 'cached' && '🟡 שערים שמורים'}
          {source === 'fallback' && '⚪ שערים משוערים (אין חיבור)'}
          {updatedAt && ` · עודכנו ${new Date(updatedAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}`}
          {error && ' · העדכון נכשל, נסו שוב כשיש אינטרנט'}
        </span>
        <button className="btn btn-secondary btn-small" onClick={refresh} disabled={loading}>
          {loading ? 'מעדכן…' : '↻ עדכון'}
        </button>
      </div>
      <p className="muted small">
        השערים להערכה בלבד – בנקים, כספומטים וצ׳יינג׳ים גובים עמלות. מקור:{' '}
        <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer" className="link">
          Rates By Exchange Rate API
        </a>
      </p>
    </>
  );
}

/** Round, market-friendly amounts in the local currency (e.g. 100/500/1,000 ฿ or 50k/100k ₫). */
function quickSteps(code: string, rates: Record<string, number>): number[] {
  const perUsd = rates[code] ?? 1;
  // Pick a base so the first row is worth roughly $1–$10.
  const base = 10 ** Math.max(0, Math.floor(Math.log10(perUsd * 3)));
  return [1, 5, 10, 20, 50, 100].map((m) => m * base);
}
