import { competitors, concept, howWeAnswer, marketContext, opportunities, statusLabel, swot } from '../data/about';
import PageHeader from '../components/PageHeader';

export default function AboutPage() {
  return (
    <>
      <PageHeader title="🧭 על הפרויקט" subtitle="החזון, השוק והמתחרים – למה בנינו את האפליקציה הזו." back={{ href: '#/more', label: 'עוד' }} />

      <section className="card about-block">
        <h2>{marketContext.title}</h2>
        {marketContext.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </section>

      <h2 className="section-title">{concept.title}</h2>
      <p>{concept.intro}</p>
      <ul className="pillars">
        {concept.pillars.map((p) => (
          <li key={p.title} className="card pillar">
            <span className="pillar-emoji" aria-hidden="true">
              {p.emoji}
            </span>
            <strong>{p.title}</strong>
            <span className="small">{p.body}</span>
            <span className={`status status-${p.status}`}>{statusLabel[p.status]}</span>
          </li>
        ))}
      </ul>

      <h2 className="section-title">{competitors.title}</h2>
      {competitors.groups.map((g) => (
        <section key={g.title} className="card about-block">
          <h3>{g.title}</h3>
          <ul className="competitors">
            {g.items.map((c) => (
              <li key={c.name}>
                <strong>{c.name}</strong> – {c.body}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="card highlight-box">
        <strong>🎯 המסקנה</strong>
        <p>{competitors.conclusion}</p>
      </div>

      <h2 className="section-title">SWOT</h2>
      <div className="swot">
        {swot.map((q) => (
          <section key={q.key} className={`card swot-${q.key}`}>
            <h3>
              {q.emoji} {q.title}
            </h3>
            <ul>
              {q.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <h2 className="section-title">{opportunities.title}</h2>
      <ol className="opps">
        {opportunities.items.map((o) => (
          <li key={o.title} className="card">
            <strong>{o.title}</strong>
            <span className="small">{o.body}</span>
          </li>
        ))}
      </ol>

      <h2 className="section-title">איך האפליקציה עונה על הסיכונים</h2>
      <ul className="opps">
        {howWeAnswer.map((h) => (
          <li key={h.risk} className="card">
            <strong>{h.risk}</strong>
            <span className="small">{h.answer}</span>
          </li>
        ))}
      </ul>

      <a href="#/faq" className="btn btn-secondary btn-block">
        ❓ שאלות שמטיילים שואלים – ואיך אנחנו עונים
      </a>
    </>
  );
}
