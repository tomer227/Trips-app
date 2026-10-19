import { useState } from 'react';
import { tips } from '../data/tips';
import PageHeader from '../components/PageHeader';

export default function TipsPage() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="💡 טיפים חשובים" subtitle="הדברים שכל מטייל ותיק היה רוצה לדעת לפני שיצא." />

      <nav className="chips" aria-label="קפיצה לנושא">
        {tips.map((s) => (
          <button
            key={s.id}
            className="chip"
            onClick={() => document.getElementById(`tips-${s.id}`)?.scrollIntoView({ behavior: 'smooth' })}
          >
            {s.emoji} {s.title}
          </button>
        ))}
      </nav>

      {tips.map((section) => (
        <section key={section.id} id={`tips-${section.id}`}>
          <h2 className="section-title">
            {section.emoji} {section.title}
          </h2>
          {section.items.map((item) => {
            const key = `${section.id}:${item.title}`;
            const isOpen = open === key;
            return (
              <div key={key} className="card accordion">
                <button className="accordion-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)}>
                  <span>{item.title}</span>
                  <span className="muted">{isOpen ? '▴' : '▾'}</span>
                </button>
                {isOpen && <p className="accordion-body">{item.body}</p>}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
