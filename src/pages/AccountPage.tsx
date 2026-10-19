import { useState, type FormEvent } from 'react';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../cloud/AuthContext';
import { messageOf } from '../cloud/useCloudReviews';
import { NAME_MAX, PASSWORD_MIN } from '../cloud/types';

type Mode = 'signin' | 'signup' | 'reset';

export default function AccountPage() {
  const auth = useAuth();

  return (
    <>
      <PageHeader title="👤 החשבון שלי" subtitle="התחברו כדי לשמור את הטיול, היומן והצ׳קליסט בענן, ולפרסם ביקורות לקהילה." back={{ href: '#/more', label: 'עוד' }} />

      {auth.status === 'loading' && <p className="muted">טוען…</p>}
      {auth.status === 'unconfigured' && <Unconfigured />}
      {auth.status === 'out' && (auth.recovering ? <NewPassword /> : <SignedOut />)}
      {auth.status === 'in' && (auth.recovering ? <NewPassword /> : <SignedIn />)}

      <div className="card privacy-note">
        <strong>🔒 מה נשמר ואצל מי</strong>
        <ul>
          <li>ביקורות שתפרסמו נראות לכולם, עם שם התצוגה שלכם (לא האימייל).</li>
          <li>תכנון הטיול, היומן, ההוצאות, הצ׳קליסט והמקומות השמורים פרטיים: רק אתם יכולים לקרוא אותם.</li>
          <li>"אני כאן" ותמונות נשארים במכשיר ולא עולים לענן.</li>
          <li>אפשר למחוק את החשבון וכל המידע בכל רגע.</li>
        </ul>
      </div>
    </>
  );
}

function Unconfigured() {
  return (
    <div className="card">
      <strong>החשבונות עוד לא הופעלו בגרסה הזו</strong>
      <p className="muted small">
        האפליקציה עובדת במלואה בלי חשבון, והנתונים נשמרים במכשיר. מי שמפעיל את האתר צריך לחבר פרויקט Supabase (ראו docs/SUPABASE_SETUP.md).
      </p>
    </div>
  );
}

function SignedOut() {
  const { backend } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!backend) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signin') {
        await backend.signIn({ email, password });
      } else if (mode === 'signup') {
        const res = await backend.signUp({ email, password, displayName: name });
        if (res.needsConfirmation) {
          setInfo('שלחנו אליכם אימייל אימות. לחצו על הקישור בו כדי להשלים את ההרשמה (בדקו גם בספאם).');
          setMode('signin');
        }
      } else {
        await backend.sendPasswordReset(email);
        setInfo('אם קיים חשבון עם האימייל הזה, שלחנו אליו קישור לאיפוס הסיסמה.');
        setMode('signin');
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="segmented compact tabs-3" role="tablist" aria-label="סוג פעולה">
        {(
          [
            ['signin', 'כניסה'],
            ['signup', 'הרשמה'],
            ['reset', 'שכחתי סיסמה'],
          ] as [Mode, string][]
        ).map(([value, label]) => (
          <button key={value} role="tab" aria-selected={mode === value} className={mode === value ? 'active' : undefined} onClick={() => { setMode(value); setError(null); setInfo(null); }}>
            {label}
          </button>
        ))}
      </div>

      <form className="form-grid" onSubmit={submit} noValidate>
        {mode === 'signup' && (
          <label>
            <span>שם תצוגה (יופיע ליד הביקורות שלכם)</span>
            <input id="account-name" type="text" autoComplete="nickname" maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
        <label>
          <span>אימייל</span>
          <input id="account-email" type="email" inputMode="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {mode !== 'reset' && (
          <label>
            <span>סיסמה{mode === 'signup' ? ` (לפחות ${PASSWORD_MIN} תווים)` : ''}</span>
            <input
              id="account-password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        )}
        {error && <p className="status-line status-error" role="alert">{error}</p>}
        {info && <p className="status-line" role="status">{info}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'רגע…' : mode === 'signin' ? 'כניסה' : mode === 'signup' ? 'יצירת חשבון' : 'שליחת קישור לאיפוס'}
        </button>
      </form>
    </div>
  );
}

function NewPassword() {
  const { backend, finishRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!backend) return;
    setBusy(true);
    setError(null);
    try {
      await backend.updatePassword(password);
      finishRecovery();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form-grid" onSubmit={submit}>
      <strong>בחירת סיסמה חדשה</strong>
      <label>
        <span>סיסמה חדשה (לפחות {PASSWORD_MIN} תווים)</span>
        <input id="new-password" type="password" autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <p className="status-line status-error" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'רגע…' : 'שמירת הסיסמה'}
      </button>
    </form>
  );
}

function SignedIn() {
  const { user, backend, sync, signOut, setUser, syncNow } = useAuth();
  const [name, setName] = useState(user?.displayName ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsynced, setUnsynced] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!user || !backend) return null;

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setUser(await backend.updateDisplayName(name));
      setMessage('שם התצוגה עודכן.');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const doSignOut = async (force: boolean) => {
    setBusy(true);
    setError(null);
    const res = await signOut({ force });
    if (!res.ok) {
      setUnsynced(!!res.unsynced);
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    setError(null);
    try {
      await backend.deleteAccount();
      await signOut({ force: true });
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <p>
          <strong>{user.displayName}</strong>
          <br />
          <span className="muted small" dir="ltr">
            {user.email}
          </span>
        </p>
        <p className="muted small" role="status">
          {sync.state === 'syncing' && '🔄 מסנכרן…'}
          {sync.state === 'idle' && (sync.lastSyncedAt ? `✅ מסונכרן ${new Date(sync.lastSyncedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : '✅ מחובר')}
          {sync.state === 'error' && '⚠️ הסנכרון נכשל. ננסה שוב כשיהיה חיבור.'}
        </p>
        <button className="btn btn-secondary btn-small" onClick={() => void syncNow().catch(() => undefined)} disabled={sync.state === 'syncing'}>
          🔄 סנכרון עכשיו
        </button>
      </div>

      <form className="card form-grid" onSubmit={saveName}>
        <label>
          <span>שם תצוגה</span>
          <input id="display-name" type="text" maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn btn-secondary" type="submit" disabled={busy || name.trim() === user.displayName}>
          שמירת שם
        </button>
      </form>

      {message && <p className="status-line" role="status">{message}</p>}
      {error && <p className="status-line status-error" role="alert">{error}</p>}

      <div className="card form-grid">
        <button className="btn btn-secondary" onClick={() => void doSignOut(false)} disabled={busy}>
          התנתקות
        </button>
        <p className="muted small">בהתנתקות הנתונים הפרטיים נמחקים מהמכשיר הזה (הם נשארים בענן) כדי שמי שישתמש בו אחריכם לא יראה אותם.</p>
        {unsynced && (
          <>
            <p className="status-line status-error" role="alert">
              לא הצלחנו לשמור את השינויים האחרונים בענן. אם תתנתקו עכשיו הם יימחקו.
            </p>
            <button className="btn btn-danger" onClick={() => void doSignOut(true)} disabled={busy}>
              להתנתק בכל זאת
            </button>
          </>
        )}
      </div>

      <div className="card form-grid">
        {!confirmDelete ? (
          <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            מחיקת החשבון
          </button>
        ) : (
          <>
            <p className="status-line status-error" role="alert">
              זה ימחק לצמיתות את החשבון, את הנתונים הפרטיים שלכם ואת כל הביקורות שפרסמתם. אי אפשר לשחזר.
            </p>
            <button className="btn btn-danger" onClick={() => void deleteAccount()} disabled={busy}>
              כן, למחוק הכול
            </button>
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
              ביטול
            </button>
          </>
        )}
      </div>
    </>
  );
}
