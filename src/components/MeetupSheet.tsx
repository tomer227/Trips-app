import { useState } from 'react';
import { useAuth } from '../cloud/AuthContext';
import { CloudError, cloudErrorMessages, type Meetup } from '../cloud/types';
import { MEETUP_PREFIX, formatMeetupTime } from '../cloud/useMeetups';
import { getCountry } from '../data/countries';

const errorText = (e: unknown) => (e instanceof CloudError ? (e.code === 'unknown' && e.message !== 'unknown' ? e.message : cloudErrorMessages[e.code]) : cloudErrorMessages.unknown);

interface Props {
  meetup: Meetup;
  onChanged: () => Promise<void> | void;
  onClose?: () => void;
  /** In a list the card is inline; on the map it is a bottom sheet. */
  inline?: boolean;
}

/** One meetup: when, where, who organises, how many are coming, and "I'm coming". */
export default function MeetupSheet({ meetup: m, onChanged, onClose, inline }: Props) {
  const { backend, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const country = getCountry(m.countryId);
  const mine = user?.id === m.userId;

  const run = async (fn: () => Promise<void>) => {
    if (!backend) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <>
      <span className="cat-badge meetup-badge">🙌 מפגש</span>
      <h2 className="sheet-title">{m.title}</h2>
      <p className="meetup-when">🗓️ {formatMeetupTime(m.startsAt)}</p>
      <p className="meetup-where">
        📍 {m.placeLabel}
        {country && ` · ${country.flag} ${country.name}`}
      </p>
      {m.text && <p className="meetup-text">{m.text}</p>}
      <p className="muted small">
        מארגן/ת: {mine ? 'אתם' : m.author} · {m.going === 0 ? 'עוד אף אחד לא אישר הגעה' : m.going === 1 ? 'מגיע/ה אחד/ת' : `מגיעים ${m.going}`}
      </p>
      <div className="form-actions">
        {!mine && (
          <button className={`btn btn-small ${m.iAmGoing ? 'btn-secondary' : ''}`} disabled={busy} onClick={() => void run(() => backend!.setGoing(m.id, !m.iAmGoing))}>
            {m.iAmGoing ? '✓ אני מגיע/ה (ביטול)' : '🙋 אני מגיע/ה'}
          </button>
        )}
        {inline && (
          <a className="btn btn-secondary btn-small" href={`#/map/${MEETUP_PREFIX}${m.id}`}>
            🗺️ על המפה
          </a>
        )}
        <a className="btn btn-secondary btn-small" href={`https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`} target="_blank" rel="noopener noreferrer">
          🧭 ניווט
        </a>
        {mine ? (
          <button
            className="btn btn-secondary btn-small"
            disabled={busy}
            onClick={() => window.confirm('למחוק את המפגש?') && void run(() => backend!.deleteMeetup(m.id).then(() => onClose?.()))}
          >
            🗑️ מחיקה
          </button>
        ) : (
          <button
            className="link-btn small"
            disabled={busy || reported}
            onClick={() =>
              window.confirm('לדווח על המפגש כלא ראוי או מסוכן?') &&
              void run(async () => {
                await backend!.reportMeetup(m.id, '');
                setReported(true);
              })
            }
          >
            {reported ? 'תודה, דווח' : '🚩 דיווח'}
          </button>
        )}
      </div>
      {error && (
        <p className="status-line status-error" role="alert">
          {error}
        </p>
      )}
    </>
  );

  if (inline) return <li className="card meetup-card">{body}</li>;
  return (
    <div className="sheet" role="dialog" aria-label={m.title}>
      <div className="sheet-handle" aria-hidden="true" />
      <button className="sheet-close" onClick={onClose} aria-label="סגירה">
        ✕
      </button>
      {body}
      <a className="link small" href="#/meetups">
        לכל המפגשים ←
      </a>
    </div>
  );
}
