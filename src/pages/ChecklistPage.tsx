import { useState } from 'react';
import { checklist } from '../data/checklist';
import type { RegionId } from '../data/types';
import { usePersistentState } from '../storage';
import PageHeader from '../components/PageHeader';

type Filter = 'all' | RegionId;

export default function ChecklistPage() {
  const [checked, setChecked] = usePersistentState<Record<string, boolean>>('checklist', {});
  const [filter, setFilter] = usePersistentState<Filter>('checklist-region', 'all');
  const [open, setOpen] = useState<Record<string, boolean>>({ before: true });

  const visible = checklist.map((cat) => ({
    ...cat,
    items: cat.items.filter((it) => filter === 'all' || !it.region || it.region === filter),
  }));
  const all = visible.flatMap((c) => c.items);
  const done = all.filter((it) => checked[it.id]).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;

  const toggle = (id: string) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <>
      <PageHeader title="✅ צ׳קליסט לטיול" subtitle="סמנו מה כבר סידרתם. ההתקדמות נשמרת במכשיר." />

      <div className="segmented compact" role="radiogroup" aria-label="סינון לפי יעד">
        {(
          [
            ['all', 'הכל'],
            ['asia', '🏯 מזרח'],
            ['south-america', '🦙 דרום אמריקה'],
          ] as [Filter, string][]
        ).map(([value, label]) => (
          <button key={value} role="radio" aria-checked={filter === value} className={filter === value ? 'active' : undefined} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>

      <div className="card progress-card">
        <div className="progress-text">
          <strong>
            {done} מתוך {all.length}
          </strong>
          <span>{pct === 100 ? 'מוכנים לטיסה! ✈️' : `${pct}%`}</span>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${pct}%` }} />
        </div>
      </div>

      {visible.map((cat) => {
        const catDone = cat.items.filter((it) => checked[it.id]).length;
        const isOpen = open[cat.id] ?? false;
        return (
          <section key={cat.id} className="card accordion">
            <button className="accordion-head" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [cat.id]: !isOpen }))}>
              <span>
                {cat.emoji} {cat.title}
              </span>
              <span className="muted">
                {catDone}/{cat.items.length} {isOpen ? '▴' : '▾'}
              </span>
            </button>
            {isOpen && (
              <ul className="checklist">
                {cat.items.map((it) => (
                  <li key={it.id}>
                    <label className={checked[it.id] ? 'done' : undefined}>
                      <input type="checkbox" checked={!!checked[it.id]} onChange={() => toggle(it.id)} />
                      <span>
                        {it.label}
                        {it.note && <small className="muted"> – {it.note}</small>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {done > 0 && (
        <button className="btn btn-secondary btn-block" onClick={() => window.confirm('לנקות את כל הסימונים?') && setChecked({})}>
          ניקוי סימונים
        </button>
      )}
    </>
  );
}
