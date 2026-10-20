import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import CountrySelect from '../components/CountrySelect';
import { useAuth } from '../cloud/AuthContext';
import {
  CloudError,
  cloudErrorMessages,
  partnerKinds,
  validatePartnerPost,
  PARTNER_REPLY_MAX,
  PARTNER_TEXT_MAX,
  type NewPartnerPost,
  type PartnerPost,
  type PartnerReply,
} from '../cloud/types';
import { formatDateRange as range, stopWindows, type TripPlan } from '../budget';
import { getCountry } from '../data/countries';

type Board = { state: 'loading' } | { state: 'error' } | { state: 'ok'; posts: PartnerPost[]; replies: PartnerReply[] };

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const errorText = (e: unknown) => (e instanceof CloudError ? (e.code === 'unknown' && e.message !== 'unknown' ? e.message : cloudErrorMessages[e.code]) : cloudErrorMessages.unknown);
const kindOf = (id: string) => partnerKinds.find((k) => k.id === id) ?? partnerKinds[0];

/**
 * "מחפשים שותף": a board of travellers looking for partners for a trek, a stretch of the route, a ride
 * or a room. Answers are private between the post's author and the person answering.
 */
export default function PartnersPage({ plan }: { plan: TripPlan }) {
  const { status, backend, user } = useAuth();
  const [board, setBoard] = useState<Board>({ state: 'loading' });
  const [filter, setFilter] = useState<string>('all');
  const [composing, setComposing] = useState(false);

  const myWindows = useMemo(() => stopWindows(plan).filter((w) => w.to >= today()), [plan]);
  const myCountries = useMemo(() => [...new Set(plan.stops.map((s) => s.countryId))].filter((id) => getCountry(id)), [plan]);

  const load = useCallback(async () => {
    if (!backend) return;
    try {
      const [posts, replies] = await Promise.all([backend.listPartnerPosts(), backend.listPartnerReplies()]);
      setBoard({ state: 'ok', posts, replies });
    } catch {
      setBoard({ state: 'error' });
    }
  }, [backend]);

  useEffect(() => {
    if (status === 'in') void load();
  }, [status, load]);

  const header = <PageHeader title="🤝 מחפשים שותף" subtitle="שותפים לטרק, לחלק מהמסלול, לג׳יפ או לחדר. מי שמתעניין שולח הודעה פרטית." back={{ href: '#/more', label: 'עוד' }} />;

  if (status !== 'in') {
    return (
      <>
        {header}
        <div className="card">
          {status === 'loading' && <p className="muted">טוען…</p>}
          {status === 'unconfigured' && <p>החשבונות עוד לא מחוברים באפליקציה, לכן הלוח עוד לא פעיל.</p>}
          {status === 'out' && (
            <>
              <p>הלוח פתוח רק למטיילים מחוברים, כדי לשמור עליו נקי ובטוח.</p>
              <a className="btn btn-small" href="#/account">
                התחברות
              </a>
            </>
          )}
        </div>
      </>
    );
  }

  const posts = board.state === 'ok' ? board.posts : [];
  const shown = filter === 'all' ? posts : posts.filter((p) => p.countryId === filter);

  return (
    <>
      {header}

      {composing ? (
        <Composer
          initial={myWindows[0]}
          onCancel={() => setComposing(false)}
          onPublish={async (post) => {
            await backend!.createPartnerPost(post);
            setComposing(false);
            await load();
          }}
        />
      ) : (
        <button className="btn btn-block add-btn" onClick={() => setComposing(true)}>
          + פרסום מודעה
        </button>
      )}

      {myCountries.length > 0 && (
        <div className="chips" role="tablist" aria-label="סינון לפי מדינה">
          <button role="tab" aria-selected={filter === 'all'} className={`chip${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
            הכל
          </button>
          {myCountries.map((id) => {
            const c = getCountry(id)!;
            return (
              <button key={id} role="tab" aria-selected={filter === id} className={`chip${filter === id ? ' active' : ''}`} onClick={() => setFilter(id)}>
                {c.flag} {c.name}
              </button>
            );
          })}
        </div>
      )}

      {board.state === 'loading' && <p className="muted">טוען מודעות…</p>}
      {board.state === 'error' && (
        <div className="card">
          <p>לא הצלחנו לטעון את הלוח. בדקו את החיבור לאינטרנט.</p>
          <button className="btn btn-small" onClick={() => void load()}>
            לנסות שוב
          </button>
        </div>
      )}
      {board.state === 'ok' && shown.length === 0 && (
        <div className="card empty">
          <p>{filter === 'all' ? 'עוד אין מודעות. תהיו הראשונים לפרסם!' : 'עוד אין מודעות למדינה הזו. פרסמו אחת, ומי שיגיע יראה אותה.'}</p>
        </div>
      )}

      <ul className="partner-list">
        {shown.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            mine={p.userId === user?.id}
            replies={board.state === 'ok' ? board.replies.filter((r) => r.postId === p.id) : []}
            myId={user?.id}
            onChange={load}
          />
        ))}
      </ul>

      <h2 className="section-title">🛟 להיפגש בבטחה</h2>
      <div className="card">
        <ul className="partner-safety small">
          <li>אל תכתבו טלפון או מקום לינה במודעה עצמה. שתפו פרטים רק בהודעה פרטית, למי שבחרתם.</li>
          <li>פגישה ראשונה במקום ציבורי, ועדיף עוד לפני שיוצאים לדרך.</li>
          <li>
            יוצאים לטרק עם מישהו חדש? עדכנו את הבית ב<a href="#/safety">רשת הביטחון</a>.
          </li>
          <li>משהו לא בסדר במודעה? לחצו "דיווח". אחרי כמה דיווחים היא מוסתרת עד שנבדוק.</li>
        </ul>
      </div>
    </>
  );
}

function Composer({ initial, onPublish, onCancel }: { initial?: { countryId: string; from: string; to: string }; onPublish: (p: NewPartnerPost) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState<NewPartnerPost>(() => ({
    countryId: initial?.countryId ?? 'peru',
    from: initial && initial.from > today() ? initial.from : today(),
    to: initial?.to ?? inDays(7),
    kind: 'trek',
    text: '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    const problem = validatePartnerPost(draft);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await onPublish(draft);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <div className="card form-grid partner-form">
      <div className="kind-picker" role="radiogroup" aria-label="מה מחפשים?">
        {partnerKinds.map((k) => (
          <button key={k.id} role="radio" aria-checked={draft.kind === k.id} className={`chip${draft.kind === k.id ? ' active' : ''}`} onClick={() => setDraft({ ...draft, kind: k.id })}>
            {k.icon} {k.label}
          </button>
        ))}
      </div>
      <label>
        <span>איפה?</span>
        <CountrySelect value={draft.countryId} onChange={(countryId) => setDraft({ ...draft, countryId })} />
      </label>
      <div className="form-row">
        <label>
          <span>מתאריך</span>
          <input type="date" min={today()} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value, to: draft.to < e.target.value ? e.target.value : draft.to })} />
        </label>
        <label>
          <span>עד</span>
          <input type="date" min={draft.from} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </label>
      </div>
      <label>
        <span>מה אתם מחפשים?</span>
        <textarea
          rows={4}
          maxLength={PARTNER_TEXT_MAX}
          placeholder="למשל: יוצאים לסלקנטאי ב־3 במרץ בלי סוכנות, מחפשים עוד 1–2 שותפים בקצב רגוע"
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        />
      </label>
      <p className="muted small">בלי טלפון או מקום לינה במודעה. מי שמתעניין ישלח לכם הודעה פרטית.</p>
      {error && <p className="status-line status-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="btn" onClick={() => void publish()} disabled={busy}>
          {busy ? 'מפרסם…' : 'פרסום'}
        </button>
        <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          ביטול
        </button>
      </div>
    </div>
  );
}

function PostCard({ post, mine, replies, myId, onChange }: { post: PartnerPost; mine: boolean; replies: PartnerReply[]; myId?: string; onChange: () => Promise<void> }) {
  const { backend } = useAuth();
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const c = getCountry(post.countryId);
  const kind = kindOf(post.kind);
  const myReply = replies.find((r) => r.userId === myId);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setError(null);
    try {
      await fn();
      if (done) setNotice(done);
      await onChange();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <li className={`card partner-post${mine ? ' mine' : ''}`}>
      <div className="partner-head">
        <span className="partner-kind">
          {kind.icon} {kind.label}
        </span>
        <span className="muted small">{range(post.from, post.to)}</span>
      </div>
      <strong>
        {c?.flag} {c?.name ?? post.countryId}
      </strong>
      <p className="partner-text">{post.text}</p>
      <p className="muted small">{mine ? 'המודעה שלכם' : `פורסם על ידי ${post.author}`}</p>

      {mine ? (
        <>
          <h3 className="partner-sub">{replies.length === 0 ? 'עוד אין הודעות' : `${replies.length} הודעות אליכם`}</h3>
          <ul className="partner-replies">
            {replies.map((r) => (
              <li key={r.id}>
                <strong>{r.author}:</strong> <span className="partner-text">{r.text}</span>{' '}
                <button className="link-btn" onClick={() => void act(() => backend!.deletePartnerReply(r.id))}>
                  מחיקה
                </button>
              </li>
            ))}
          </ul>
          <button
            className="link-btn"
            onClick={() => {
              if (window.confirm('למחוק את המודעה ואת כל ההודעות אליה?')) void act(() => backend!.deletePartnerPost(post.id));
            }}
          >
            מחיקת המודעה
          </button>
        </>
      ) : myReply ? (
        <p className="small">
          ✅ שלחתם: <span className="partner-text">{myReply.text}</span>{' '}
          <button className="link-btn" onClick={() => void act(() => backend!.deletePartnerReply(myReply.id))}>
            ביטול
          </button>
        </p>
      ) : answer === null ? (
        <div className="form-actions">
          <button className="btn btn-small" onClick={() => setAnswer('')}>
            ✉️ אני בעניין
          </button>
          <button
            className="link-btn"
            onClick={() => {
              if (window.confirm('לדווח על המודעה כלא מתאימה?')) void act(() => backend!.reportPartnerPost(post.id, 'user report'), 'תודה, הדיווח התקבל.');
            }}
          >
            דיווח
          </button>
        </div>
      ) : (
        <div className="form-grid">
          <label>
            <span>הודעה פרטית ל{post.author}</span>
            <textarea rows={3} maxLength={PARTNER_REPLY_MAX} placeholder="ספרו קצת על עצמכם ואיך ליצור קשר (וואטסאפ, אינסטגרם)" value={answer} onChange={(e) => setAnswer(e.target.value)} />
          </label>
          <p className="muted small">רק {post.author} יראו את ההודעה.</p>
          <div className="form-actions">
            <button className="btn btn-small" disabled={answer.trim().length < 2} onClick={() => void act(() => backend!.replyToPartnerPost(post.id, answer))}>
              שליחה
            </button>
            <button className="btn btn-small btn-secondary" onClick={() => setAnswer(null)}>
              ביטול
            </button>
          </div>
        </div>
      )}
      {error && <p className="status-line status-error" role="alert">{error}</p>}
      {notice && <p className="small">{notice}</p>}
    </li>
  );
}
