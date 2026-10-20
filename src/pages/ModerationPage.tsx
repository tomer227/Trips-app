import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../cloud/AuthContext';
import { messageOf } from '../cloud/useCloudReviews';
import type { ModAction, ModItem } from '../cloud/types';
import { getCountry } from '../data/countries';
import { formatDate } from '../journal';

type State = { state: 'loading' } | { state: 'denied' } | { state: 'error'; message: string } | { state: 'ok'; items: ModItem[] };

/** Reported and hidden reviews and partner posts, for the people listed as moderators. */
export default function ModerationPage() {
  const { status, backend } = useAuth();
  const [view, setView] = useState<State>({ state: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!backend) return;
    try {
      if (!(await backend.isModerator())) return setView({ state: 'denied' });
      setView({ state: 'ok', items: await backend.moderationQueue() });
    } catch (err) {
      setView({ state: 'error', message: messageOf(err) });
    }
  }, [backend]);

  useEffect(() => {
    if (status === 'in') void load();
    else if (status !== 'loading') setView({ state: 'denied' });
  }, [status, load]);

  const act = async (item: ModItem, action: ModAction) => {
    if (!backend) return;
    if (action === 'delete' && !window.confirm('למחוק לצמיתות?')) return;
    setBusy(item.id);
    try {
      await backend.moderate(item.kind, item.id, action);
      await load();
    } catch (err) {
      setView({ state: 'error', message: messageOf(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="🛡️ ניהול דיווחים" subtitle="ביקורות ומודעות שדווחו או הוסתרו. שמות המדווחים לא מוצגים." back={{ href: '#/account', label: 'החשבון שלי' }} />
      {view.state === 'loading' && <p className="muted">טוען…</p>}
      {view.state === 'denied' && (
        <div className="card">
          <p>העמוד הזה פתוח רק למנהלים.</p>
        </div>
      )}
      {view.state === 'error' && (
        <div className="card" role="alert">
          <p>{view.message}</p>
          <button className="btn btn-secondary" onClick={() => void load()}>
            נסו שוב
          </button>
        </div>
      )}
      {view.state === 'ok' && view.items.length === 0 && (
        <div className="card empty">
          <p>🎉 אין כרגע שום דבר שמחכה לבדיקה.</p>
        </div>
      )}
      {view.state === 'ok' && view.items.length > 0 && (
        <ul className="mod-list">
          {view.items.map((item) => {
            const country = item.kind !== 'review' ? getCountry(item.subject) : undefined;
            return (
              <li key={`${item.kind}-${item.id}`} className={`card mod-item ${item.hidden ? 'is-hidden' : ''}`}>
                <p className="mod-meta muted small">
                  {item.kind === 'review' ? '⭐ ביקורת' : item.kind === 'post' ? '🤝 מודעת שותפים' : '🙌 מפגש'} · {item.author} · {formatDate(new Date(item.createdAt).toISOString().slice(0, 10))}
                  {country && ` · ${country.flag} ${country.name}`}
                </p>
                <p className="mod-text">{item.text || <span className="muted">(בלי טקסט)</span>}</p>
                <p className="small">
                  {item.hidden ? <strong className="mod-hidden">מוסתר</strong> : <strong>מוצג</strong>} · {item.reports} דיווחים
                  {item.reasons.length > 0 && <> · סיבות: {item.reasons.join(' / ')}</>}
                </p>
                {item.kind === 'review' && (
                  <a className="link small" href={`#/map/${encodeURIComponent(item.subject)}`}>
                    פתיחת המקום במפה
                  </a>
                )}
                <div className="form-actions">
                  <button className="btn btn-small" disabled={busy === item.id} onClick={() => void act(item, 'restore')}>
                    ✅ תקין, להציג
                  </button>
                  {!item.hidden && (
                    <button className="btn btn-secondary btn-small" disabled={busy === item.id} onClick={() => void act(item, 'hide')}>
                      🙈 להסתיר
                    </button>
                  )}
                  <button className="btn btn-secondary btn-small" disabled={busy === item.id} onClick={() => void act(item, 'delete')}>
                    🗑️ למחוק
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
