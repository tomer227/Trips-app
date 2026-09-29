import { useState } from 'react';
import { getCountry } from '../data/countries';
import { categoryInfo, monthNames, monthRange, type Place } from '../data/places';
import { hotspotFor, hotspotLabel } from '../places/hotspot';
import { googleMapsUrl, priceSymbols } from '../places/mapping';
import { useGooglePhoto } from '../places/usePlaces';
import { resizeImage, reviewStats, reviewTags, shareText, type Community, type Review, type ReviewTag } from '../community';
import { newId } from '../journal';
import { formatUsd } from '../budget';

interface Props {
  place: Place;
  community: Community;
  update: (fn: (prev: Community) => Community) => boolean;
  onClose: () => void;
}

export default function PlaceSheet({ place, community, update, onClose }: Props) {
  const [writing, setWriting] = useState(false);
  const country = getCountry(place.countryId);
  const info = categoryInfo[place.category];
  const reviews = community.reviews.filter((r) => r.placeId === place.id).sort((a, b) => b.visited.localeCompare(a.visited));
  const stats = reviewStats(reviews);
  const hotspot = hotspotFor(place, reviews);
  const sourceNote = place.source === 'google' ? 'מידע חיצוני מ־Google' : place.custom ? 'נוסף על ידי משתמש' : 'נבחר על ידי צוות האפליקציה';
  const saved = community.saved.includes(place.id);
  const here = community.checkIn?.placeId === place.id;
  const link = `${location.origin}${location.pathname}#/map/${place.id}`;

  const toggleSaved = () =>
    update((c) => ({ ...c, saved: saved ? c.saved.filter((id) => id !== place.id) : [...c.saved, place.id] }));

  const checkIn = () => {
    update((c) => ({ ...c, checkIn: here ? null : { placeId: place.id, at: Date.now() } }));
    // Sharing is always the user's explicit choice; only the place name is sent, never exact coordinates.
    if (!here) void shareText(`📍 אני עכשיו ב${place.name}${country ? ` (${country.name})` : ''} – מי בסביבה? 🎒`, link);
  };

  const removeCustom = () => {
    if (!window.confirm('למחוק את המקום שהוספתם (כולל הביקורות עליו)?')) return;
    update((c) => ({
      ...c,
      customPlaces: c.customPlaces.filter((p) => p.id !== place.id),
      reviews: c.reviews.filter((r) => r.placeId !== place.id),
      saved: c.saved.filter((id) => id !== place.id),
      checkIn: c.checkIn?.placeId === place.id ? null : c.checkIn,
    }));
    onClose();
  };

  return (
    <div className="sheet" role="dialog" aria-label={place.name}>
      <div className="sheet-handle" aria-hidden="true" />
      <button className="sheet-close" onClick={onClose} aria-label="סגירה">
        ✕
      </button>

      <span className="cat-badge" style={{ background: info.color }}>
        {info.emoji} {info.label}
      </span>
      <h2 className="sheet-title">{place.name}</h2>
      {country && (
        <a className="muted small" href={`#/country/${place.countryId}`}>
          {country.flag} {country.name} · למדריך המדינה ←
        </a>
      )}

      <div className="place-meta">
        {place.rating !== undefined && (
          <span className="pill pill-google">
            ⭐ {place.rating.toFixed(1)} (Google{place.userRatingCount ? ` · ${place.userRatingCount.toLocaleString('en-US')}` : ''})
          </span>
        )}
        {stats.average !== null && (
          <span className="pill">
            🇮🇱 {stats.average.toFixed(1)} (קהילת "הטיול הגדול" · {stats.count})
          </span>
        )}
        {place.priceLevel && <span className="pill pill-google">{priceSymbols(place.priceLevel)}</span>}
        {place.openNow !== undefined && <span className="pill pill-google">{place.openNow ? '🟢 פתוח עכשיו' : '🔴 סגור עכשיו'}</span>}
        {hotspot && <span className="pill">{hotspotLabel(hotspot)}</span>}
        {place.when && <span className="pill">📅 {place.when}</span>}
        {!place.when && place.months && place.months.length < 12 && (
          <span className="pill">🌤️ {monthRange(place.months)}</span>
        )}
        {place.custom && <span className="pill">📌 הוספתם</span>}
      </div>

      {place.safety && (
        <div className="safety-box">
          <strong>⚠️ שימו לב</strong>
          <p>{place.safety}</p>
          <span className="muted small">מידע כללי מהצוות – לא אומת מול מקור רשמי. בדקו גם באזהרות המסע של משרד החוץ.</span>
        </div>
      )}
      {place.desc && <p className="place-desc">{place.desc}</p>}
      <p className={`source-note source-${place.source ?? 'local'}`}>{sourceNote}</p>
      {place.source === 'google' && <GoogleInfo place={place} />}

      <div className="sheet-actions">
        <button className={`btn ${here ? '' : 'btn-secondary'}`} onClick={checkIn} title="המיקום נשמר רק במכשיר שלכם">
          {here ? '📍 אתם כאן' : '📍 אני כאן'}
        </button>
        <button className={`btn btn-secondary ${saved ? 'on' : ''}`} onClick={toggleSaved}>
          {saved ? '💚 שמור' : '🤍 רוצה להגיע'}
        </button>
        <button className="btn btn-secondary" onClick={() => void shareText(`${info.emoji} ${place.name} – שווה לבדוק! 🎒`, link)}>
          📤 שיתוף
        </button>
      </div>

      <h3 className="section-title">ביקורות {stats.count > 0 && `(${stats.count})`}</h3>

      {stats.tagCounts.length > 0 && (
        <div className="tag-summary">
          {stats.tagCounts.map(({ tag, count }) => (
            <span key={tag} className={`tag tag-${reviewTags[tag].tone}`}>
              {reviewTags[tag].emoji} {reviewTags[tag].label} {count > 1 && `×${count}`}
            </span>
          ))}
          {stats.averageCostUsd !== null && <span className="tag tag-info">💵 בממוצע {formatUsd(stats.averageCostUsd)}</span>}
        </div>
      )}

      {writing ? (
        <ReviewForm
          onCancel={() => setWriting(false)}
          onSave={(review) => {
            const ok = update((c) => ({ ...c, reviews: [...c.reviews, { ...review, placeId: place.id }] }));
            if (ok) setWriting(false);
            else window.alert('אין מספיק מקום במכשיר. נסו בלי תמונה, או גבו ומחקו ביקורות ישנות.');
          }}
        />
      ) : (
        <button className="btn btn-block" onClick={() => setWriting(true)}>
          ✍️ כתבו חוויה ישראלית על המקום
        </button>
      )}

      {reviews.length === 0 && !writing && <p className="muted small center">עוד אין ביקורות על המקום. היו הראשונים!</p>}

      <ul className="reviews">
        {reviews.map((r) => (
          <li key={r.id} className="review">
            <div className="review-head">
              <span>{'⭐'.repeat(r.stars)}</span>
              <span className="muted small">
                ביקור ב{formatMonth(r.visited)}
                {r.costUsd ? ` · ${formatUsd(r.costUsd)}` : ''}
              </span>
            </div>
            {r.tags.length > 0 && (
              <div className="tag-summary">
                {r.tags.map((t) => (
                  <span key={t} className={`tag tag-${reviewTags[t].tone}`}>
                    {reviewTags[t].emoji} {reviewTags[t].label}
                  </span>
                ))}
              </div>
            )}
            {r.text && <p>{r.text}</p>}
            {r.photo && <img src={r.photo} alt="" className="review-photo" loading="lazy" />}
            <button
              className="link-btn danger small"
              onClick={() => window.confirm('למחוק את הביקורת?') && update((c) => ({ ...c, reviews: c.reviews.filter((x) => x.id !== r.id) }))}
            >
              מחיקה
            </button>
          </li>
        ))}
      </ul>

      {place.custom && (
        <button className="btn btn-danger" onClick={removeCustom}>
          מחיקת המקום
        </button>
      )}
    </div>
  );
}

/** Everything that comes from Google, kept together and clearly labelled (with the attribution Google requires). */
function GoogleInfo({ place }: { place: Place }) {
  const photo = useGooglePhoto(place.photoName);
  const mapsUrl = googleMapsUrl(place);
  return (
    <div className="google-info">
      {photo && (
        <figure>
          <img src={photo} alt="" loading="lazy" className="review-photo" />
          {place.photoAttribution && <figcaption className="muted small">📷 {place.photoAttribution} · Google</figcaption>}
        </figure>
      )}
      {place.address && <p>📍 {place.address}</p>}
      {place.openingHours && place.openingHours.length > 0 && (
        <details>
          <summary>🕒 שעות פתיחה</summary>
          <ul className="hours">
            {place.openingHours.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}
      {place.phone && (
        <p>
          📞 <a className="link" href={`tel:${place.phone.replace(/[^\d+]/g, '')}`} dir="ltr">{place.phone}</a>
        </p>
      )}
      {place.website && (
        <p>
          🌐{' '}
          <a className="link" href={place.website} target="_blank" rel="noopener noreferrer">
            אתר המקום
          </a>
        </p>
      )}
      {mapsUrl && (
        <a className="btn btn-block" href={mapsUrl} target="_blank" rel="noopener noreferrer">
          🧭 נווט ב־Google Maps
        </a>
      )}
      <p className="muted small">
        Powered by Google
        {place.sourceUpdatedAt && ` · נטען ${new Date(place.sourceUpdatedAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}`}
      </p>
    </div>
  );
}

function ReviewForm({ onSave, onCancel }: { onSave: (r: Review) => void; onCancel: () => void }) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [visited, setVisited] = useState(thisMonth);
  const [cost, setCost] = useState('');
  const [tags, setTags] = useState<ReviewTag[]>([]);
  const [photo, setPhoto] = useState<string>();
  const [busy, setBusy] = useState(false);

  const toggle = (t: ReviewTag) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  return (
    <div className="card form-grid review-form">
      <div className="stars-input" role="radiogroup" aria-label="דירוג">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={stars === n} aria-label={`${n} כוכבים`} onClick={() => setStars(n)} className={n <= stars ? 'on' : undefined}>
            ★
          </button>
        ))}
      </div>

      <div>
        <span className="field-label">תגיות עם "עין ישראלית"</span>
        <div className="category-picker">
          {(Object.keys(reviewTags) as ReviewTag[]).map((t) => (
            <button key={t} className={`chip ${tags.includes(t) ? 'active' : ''}`} onClick={() => toggle(t)} aria-pressed={tags.includes(t)}>
              {reviewTags[t].emoji} {reviewTags[t].label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-row">
        <label>
          <span>מתי הייתם?</span>
          <input type="month" value={visited} max={thisMonth} onChange={(e) => setVisited(e.target.value)} />
        </label>
        <label>
          <span>כמה עלה? ($)</span>
          <input type="number" inputMode="decimal" min={0} placeholder="לא חובה" value={cost} onChange={(e) => setCost(e.target.value)} />
        </label>
      </div>

      <label>
        <span>ספרו בכמה מילים</span>
        <textarea rows={3} placeholder="מה היה טוב, מה פחות, טיפ למי שמגיע אחריכם…" value={text} onChange={(e) => setText(e.target.value)} />
      </label>

      <label className="photo-input">
        <span>{photo ? '📷 תמונה נוספה (לחצו להחלפה)' : '📷 הוספת תמונה (לא חובה)'}</span>
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              setPhoto(await resizeImage(file));
            } catch {
              window.alert('לא הצלחנו לקרוא את התמונה.');
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {photo && <img src={photo} alt="" className="review-photo" />}

      <div className="form-actions">
        <button
          className="btn"
          disabled={!stars || busy}
          onClick={() =>
            onSave({
              id: newId(),
              placeId: '',
              stars,
              text: text.trim(),
              visited,
              costUsd: Number(cost) > 0 ? Number(cost) : undefined,
              tags,
              photo,
              createdAt: Date.now(),
            })
          }
        >
          {stars ? 'פרסום' : 'בחרו דירוג'}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          ביטול
        </button>
      </div>
    </div>
  );
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return y && m ? `${monthNames[m - 1]} ${y}` : ym;
}
