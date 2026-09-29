import { useState } from 'react';
import { countries, getCountry, regions } from '../data/countries';
import { convert, currencyCodes, currencyNames, formatMoney, useRates } from '../currency';
import { formatUsd, type TripPlan } from '../budget';
import {
  categories,
  emptyJournal,
  formatDate,
  moods,
  newId,
  sortByDateDesc,
  summarizeExpenses,
  today,
  type Expense,
  type ExpenseCategory,
  type Journal,
  type JournalEntry,
} from '../journal';
import { usePersistentState } from '../storage';
import PageHeader from '../components/PageHeader';

type Tab = 'memories' | 'expenses';

export default function JournalPage({ plan }: { plan: TripPlan }) {
  const [journal, setJournal] = usePersistentState<Journal>('journal', emptyJournal);
  const [tab, setTab] = usePersistentState<Tab>('journal-tab', 'memories');

  // Default country: the one used last, otherwise the first stop of the planned trip.
  const lastCountry =
    sortByDateDesc([...journal.entries, ...journal.expenses])[0]?.countryId ?? plan.stops[0]?.countryId ?? countries[0].id;

  return (
    <>
      <PageHeader title="📔 יומן הטיול" subtitle="הזיכרונות וההוצאות שלכם – נשמרים רק במכשיר." />

      <div className="segmented" role="tablist" aria-label="יומן">
        {(
          [
            ['memories', '✍️ זיכרונות', count(journal.entries.length, 'רשומה אחת', 'רשומות')],
            ['expenses', '💸 הוצאות', count(journal.expenses.length, 'הוצאה אחת', 'הוצאות')],
          ] as [Tab, string, string][]
        ).map(([value, label, desc]) => (
          <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? 'active' : undefined} onClick={() => setTab(value)}>
            <strong>{label}</strong>
            <span>{desc}</span>
          </button>
        ))}
      </div>

      {tab === 'memories' ? (
        <Memories journal={journal} setJournal={setJournal} defaultCountry={lastCountry} />
      ) : (
        <Expenses journal={journal} setJournal={setJournal} defaultCountry={lastCountry} plan={plan} />
      )}
    </>
  );
}

function count(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}

interface SectionProps {
  journal: Journal;
  setJournal: (update: (prev: Journal) => Journal) => void;
  defaultCountry: string;
}

function CountrySelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="מדינה">
      {regions.map((r) => (
        <optgroup key={r.id} label={r.name}>
          {countries
            .filter((c) => c.region === r.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.flag} {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

/* ───────────── Memories ───────────── */

function Memories({ journal, setJournal, defaultCountry }: SectionProps) {
  const blank = (): JournalEntry => ({ id: '', date: today(), countryId: defaultCountry, title: '', text: '', mood: '😊' });
  const [draft, setDraft] = useState<JournalEntry | null>(null);

  const save = () => {
    if (!draft || (!draft.title.trim() && !draft.text.trim())) return;
    setJournal((j) =>
      draft.id
        ? { ...j, entries: j.entries.map((e) => (e.id === draft.id ? draft : e)) }
        : { ...j, entries: [...j.entries, { ...draft, id: newId() }] },
    );
    setDraft(null);
  };

  const remove = (id: string) => {
    if (window.confirm('למחוק את הרשומה?')) setJournal((j) => ({ ...j, entries: j.entries.filter((e) => e.id !== id) }));
  };

  return (
    <>
      {draft ? (
        <div className="card form-grid entry-form">
          <div className="form-row">
            <label>
              <span>תאריך</span>
              <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </label>
            <label>
              <span>איפה?</span>
              <CountrySelect value={draft.countryId} onChange={(countryId) => setDraft({ ...draft, countryId })} />
            </label>
          </div>
          <div className="mood-picker" role="radiogroup" aria-label="איך היה?">
            <span>איך היה?</span>
            {moods.map((m) => (
              <button key={m} role="radio" aria-checked={draft.mood === m} className={draft.mood === m ? 'active' : undefined} onClick={() => setDraft({ ...draft, mood: m })}>
                {m}
              </button>
            ))}
          </div>
          <label>
            <span>כותרת</span>
            <input type="text" placeholder="למשל: זריחה על אנגקור וואט" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label>
            <span>מה קרה היום?</span>
            <textarea rows={5} placeholder="עם מי הייתם, מה ראיתם, מה אכלתם…" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          </label>
          <div className="form-actions">
            <button className="btn" onClick={save} disabled={!draft.title.trim() && !draft.text.trim()}>
              שמירה
            </button>
            <button className="btn btn-secondary" onClick={() => setDraft(null)}>
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-block add-btn" onClick={() => setDraft(blank())}>
          + רשומה חדשה ביומן
        </button>
      )}

      {journal.entries.length === 0 && !draft && (
        <div className="card empty">
          <p>📖 עוד אין רשומות. כתבו כמה שורות בסוף כל יום – בעוד 10 שנים תודו לעצמכם.</p>
        </div>
      )}

      <ul className="entries">
        {sortByDateDesc(journal.entries).map((e) => {
          const c = getCountry(e.countryId);
          return (
            <li key={e.id} className="card entry">
              <div className="entry-head">
                <span className="muted small">
                  {formatDate(e.date)} · {c?.flag} {c?.name}
                </span>
                <span className="entry-mood" aria-hidden="true">
                  {e.mood}
                </span>
              </div>
              {e.title && <strong className="entry-title">{e.title}</strong>}
              {e.text && <p className="entry-text">{e.text}</p>}
              <div className="entry-actions">
                <button className="link-btn" onClick={() => setDraft(e)}>
                  עריכה
                </button>
                <button className="link-btn danger" onClick={() => remove(e.id)}>
                  מחיקה
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/* ───────────── Expenses ───────────── */

function Expenses({ journal, setJournal, defaultCountry, plan }: SectionProps & { plan: TripPlan }) {
  const { rates } = useRates();
  const currencyOf = (countryId: string) => getCountry(countryId)?.currencyCode ?? 'USD';

  const [countryId, setCountryId] = useState(defaultCountry);
  const [currency, setCurrency] = useState(currencyOf(defaultCountry));
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const numeric = Number(amount);
  const amountUsd = numeric > 0 ? convert(numeric, currency, 'USD', rates) : null;

  const add = () => {
    if (amountUsd === null) return;
    const expense: Expense = { id: newId(), date, countryId, category, amount: numeric, currency, amountUsd, note: note.trim() };
    setJournal((j) => ({ ...j, expenses: [...j.expenses, expense] }));
    setAmount('');
    setNote('');
  };

  const remove = (id: string) => {
    if (window.confirm('למחוק את ההוצאה?')) setJournal((j) => ({ ...j, expenses: j.expenses.filter((e) => e.id !== id) }));
  };

  const summary = summarizeExpenses(journal.expenses, plan);
  const totalIls = convert(summary.totalUsd, 'USD', 'ILS', rates) ?? 0;
  const maxCat = Math.max(1, ...summary.byCategory.map((c) => c.usd));

  return (
    <>
      <div className="card form-grid expense-form">
        <div className="form-row">
          <label className="grow">
            <span>סכום</span>
            <input type="number" inputMode="decimal" min={0} placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            <span>מטבע</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencyCodes.map((c) => (
                <option key={c} value={c}>
                  {currencyNames[c].flag} {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        {amountUsd !== null && currency !== 'USD' && <span className="muted small">≈ {formatUsd(amountUsd)}</span>}

        <div className="category-picker" role="radiogroup" aria-label="קטגוריה">
          {(Object.keys(categories) as ExpenseCategory[]).map((c) => (
            <button key={c} role="radio" aria-checked={category === c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
              {categories[c].emoji} {categories[c].label}
            </button>
          ))}
        </div>

        <div className="form-row">
          <label>
            <span>מדינה</span>
            <CountrySelect
              value={countryId}
              onChange={(id) => {
                setCountryId(id);
                setCurrency(currencyOf(id));
              }}
            />
          </label>
          <label>
            <span>תאריך</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label>
          <span>הערה (לא חובה)</span>
          <input type="text" placeholder="למשל: הוסטל בצ׳יאנג מאי" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="btn" onClick={add} disabled={amountUsd === null}>
          + הוספת הוצאה
        </button>
      </div>

      {journal.expenses.length > 0 && (
        <>
          <h2 className="section-title">סיכום</h2>
          <div className="card totals">
            <div className="total-main">
              <span className="muted">הוצאתם עד עכשיו</span>
              <strong className="big-number">{formatUsd(summary.totalUsd)}</strong>
              <span className="muted">
                ≈ {formatMoney(totalIls, 'ILS')} · {formatUsd(summary.perDayUsd)} ליום בממוצע ({summary.days} ימים)
              </span>
            </div>
            <ul className="cat-bars">
              {summary.byCategory.map(({ category: c, usd }) => (
                <li key={c}>
                  <span>
                    {categories[c].emoji} {categories[c].label}
                  </span>
                  <span className="bar" aria-hidden="true">
                    <span style={{ width: `${(usd / maxCat) * 100}%` }} />
                  </span>
                  <span>{formatUsd(usd)}</span>
                </li>
              ))}
            </ul>
          </div>

          <h2 className="section-title">מול התכנון (לפי יום)</h2>
          <ul className="country-compare">
            {summary.byCountry.map((row) => {
              const c = getCountry(row.countryId);
              const actual = row.usd / Math.max(1, row.days);
              const over = row.plannedPerDayUsd !== null && actual > row.plannedPerDayUsd;
              return (
                <li key={row.countryId} className="card">
                  <strong>
                    {c?.flag} {c?.name}
                  </strong>
                  <span className={over ? 'over' : 'under'}>
                    {formatUsd(actual)} ליום
                    {row.plannedPerDayUsd !== null && (
                      <>
                        {' '}
                        · תכננתם {formatUsd(row.plannedPerDayUsd)} {over ? '⚠️' : '👍'}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          <h2 className="section-title">כל ההוצאות</h2>
          <ul className="expense-list">
            {sortByDateDesc(journal.expenses).map((e) => {
              const c = getCountry(e.countryId);
              return (
                <li key={e.id} className="card expense">
                  <span className="expense-icon" aria-hidden="true">
                    {categories[e.category].emoji}
                  </span>
                  <span className="expense-text">
                    <strong>{e.note || categories[e.category].label}</strong>
                    <span className="muted small">
                      {formatDate(e.date)} · {c?.flag} {c?.name}
                    </span>
                  </span>
                  <span className="expense-amount">
                    <strong dir="ltr">{formatMoney(e.amount, e.currency)}</strong>
                    {e.currency !== 'USD' && <span className="muted small">{formatUsd(e.amountUsd)}</span>}
                  </span>
                  <button className="icon-btn" onClick={() => remove(e.id)} aria-label="מחיקת הוצאה">
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
