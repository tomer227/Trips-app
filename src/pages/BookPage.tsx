import { formatUsd } from '../budget';
import { emptyJournal, formatDate, type Journal } from '../journal';
import { usePersistentState } from '../storage';
import { buildTripBook } from '../tripBook';
import PageHeader from '../components/PageHeader';

/** The journal as a printable book: a cover, then one chapter per country, oldest memory first. */
export default function BookPage() {
  const [journal] = usePersistentState<Journal>('journal', emptyJournal);
  const book = buildTripBook(journal);

  return (
    <>
      <div className="no-print">
        <PageHeader title="📖 ספר הטיול" subtitle="היומן שלכם כספר: אפשר להדפיס, או לשמור כ־PDF ולשלוח למשפחה." back={{ href: '#/journal', label: 'יומן' }} />
        {book.entries > 0 && (
          <button className="btn btn-block" onClick={() => window.print()}>
            🖨️ הדפסה או שמירה כ־PDF
          </button>
        )}
      </div>

      {book.entries === 0 ? (
        <div className="card empty">
          <p>הספר נכתב מהיומן. כתבו כמה רשומות ב<a className="link" href="#/journal">יומן</a>, והן יופיעו כאן כספר.</p>
        </div>
      ) : (
        <article className="trip-book">
          <header className="book-cover">
            <p className="book-flags" aria-hidden="true">
              {[...new Set(book.chapters.map((c) => c.flag))].map((flag) => (
                <span key={flag}>{flag}</span>
              ))}
            </p>
            <h2>הטיול הגדול שלי</h2>
            {book.from && book.to && (
              <p>
                {formatDate(book.from)} עד {formatDate(book.to)}
              </p>
            )}
            <ul className="book-stats">
              <li>
                <strong>{book.days}</strong> ימים
              </li>
              <li>
                <strong>{book.countries}</strong> {book.countries === 1 ? 'מדינה' : 'מדינות'}
              </li>
              <li>
                <strong>{book.entries}</strong> {book.entries === 1 ? 'זיכרון' : 'זיכרונות'}
              </li>
              {book.spentUsd > 0 && (
                <li>
                  <strong>{formatUsd(book.spentUsd)}</strong> הוצאות
                </li>
              )}
            </ul>
          </header>

          {book.chapters.map((chapter, i) => (
            <section key={`${chapter.countryId}-${i}`} className="book-chapter">
              <h3>
                {chapter.flag} {chapter.countryName}
              </h3>
              <p className="muted small">
                {chapter.from === chapter.to ? formatDate(chapter.from) : `${formatDate(chapter.from)} עד ${formatDate(chapter.to)}`}
                {chapter.spentUsd > 0 && ` · ${formatUsd(chapter.spentUsd)}`}
              </p>
              {chapter.entries.map((e) => (
                <div key={e.id} className="book-entry">
                  <p className="book-entry-head">
                    <span className="muted small">{formatDate(e.date)}</span> <span aria-hidden="true">{e.mood}</span>
                  </p>
                  {e.title && <h4>{e.title}</h4>}
                  {e.text && <p className="book-entry-text">{e.text}</p>}
                </div>
              ))}
            </section>
          ))}
        </article>
      )}
    </>
  );
}
