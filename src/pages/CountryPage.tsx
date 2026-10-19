import { useState } from 'react';
import { getCountry, getRegion } from '../data/countries';
import { formatUsd, type TripPlan } from '../budget';
import { convert, formatMoney, useRates } from '../currency';
import PageHeader from '../components/PageHeader';

interface Props {
  countryId: string;
  plan: TripPlan;
  onAdd: (countryId: string, days: number) => void;
}

export default function CountryPage({ countryId, plan, onAdd }: Props) {
  const country = getCountry(countryId);
  const [days, setDays] = useState(country?.suggestedDays ?? 14);
  const { rates } = useRates();

  if (!country) return <PageHeader title="המדינה לא נמצאה" back={{ href: '#/', label: 'חזרה לבית' }} />;

  const region = getRegion(country.region);
  const inTrip = plan.stops.some((s) => s.countryId === country.id);

  const facts = [
    { icon: '🛂', label: 'ויזה לישראלים', value: country.visa },
    { icon: '🌤️', label: 'מתי הכי כדאי', value: country.bestSeason },
    { icon: '💵', label: 'תקציב יומי', value: `${formatUsd(country.dailyBudget[0])} (חסכוני) – ${formatUsd(country.dailyBudget[1])} (נוח) ליום` },
    {
      icon: '💱',
      label: 'מטבע',
      value: (
        <>
          {country.currency}
          <a className="link fact-link" href={`#/currency/${country.currencyCode}`}>
            {currencyHint(country.currencyCode, rates)} · לממיר ←
          </a>
        </>
      ),
    },
    { icon: '🗣️', label: 'שפה', value: country.language },
    { icon: '🔌', label: 'שקעים', value: country.plugs },
    { icon: '🚨', label: 'מספרי חירום', value: country.emergency },
    { icon: '🕯️', label: 'בית חב״ד', value: country.chabad ? 'יש – בערים ובאזורים התיירותיים המרכזיים' : 'אין קבוע (נכון לעדכון האחרון)' },
  ];

  return (
    <>
      <PageHeader
        title={`${country.flag} ${country.name}`}
        subtitle={country.vibe}
        back={{ href: `#/region/${region.id}`, label: region.name }}
      />

      <div className="card add-card">
        {inTrip ? (
          <>
            <span>✅ {country.name} כבר בטיול שלכם</span>
            <a className="btn btn-secondary" href="#/plan">
              לתכנון
            </a>
          </>
        ) : (
          <>
            <label className="days-input">
              <span>כמה ימים?</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <button className="btn" onClick={() => onAdd(country.id, days)}>
              + הוסיפו לטיול
            </button>
          </>
        )}
      </div>

      <h2 className="section-title">מה חשוב לדעת</h2>
      <p className="unverified">
        ⚠️ הוויזה, מספרי החירום והמחירים נכתבו לפי ידע כללי ולא אומתו מול מקור רשמי. בדקו באתר משרד החוץ ובאזהרות המסע של
        המל״ל לפני הטיסה.
      </p>
      <dl className="facts">
        {facts.map((f) => (
          <div key={f.label} className="fact">
            <dt>
              <span aria-hidden="true">{f.icon}</span> {f.label}
            </dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="section-title">מקומות שאסור לפספס</h2>
      <ul className="highlights">
        {country.highlights.map((h) => (
          <li key={h.name} className="card">
            <strong>📍 {h.name}</strong>
            <span className="muted">{h.desc}</span>
          </li>
        ))}
      </ul>

      <h2 className="section-title">טיפים מהשטח</h2>
      <ul className="tip-list">
        {country.tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      <p className="disclaimer">בדקו תנאי כניסה ואזהרות מסע עדכניים באתר משרד החוץ לפני הטיסה.</p>
    </>
  );
}

/** e.g. "100 THB ≈ ₪10" – picks a round amount that's worth a few dollars. */
function currencyHint(code: string, rates: Record<string, number>): string {
  if (code === 'USD') {
    const ils = convert(1, 'USD', 'ILS', rates);
    return ils ? `$1 ≈ ${formatMoney(ils, 'ILS')}` : '';
  }
  const perUsd = rates[code] ?? 1;
  const amount = 10 ** Math.max(0, Math.round(Math.log10(perUsd * 5)));
  const ils = convert(amount, code, 'ILS', rates);
  return ils === null ? '' : `${amount.toLocaleString('en-US')} ${code} ≈ ${formatMoney(ils, 'ILS')}`;
}
