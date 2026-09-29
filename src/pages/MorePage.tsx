import { useRef, useState } from 'react';
import { exportBackup, importBackup } from '../journal';
import PageHeader from '../components/PageHeader';

const links = [
  { href: '#/hot', icon: '🔥', title: 'פופולרי בעונה זו', desc: 'פסטיבלים ונקודות מפגש החודש' },
  { href: '#/checklist', icon: '✅', title: 'צ׳קליסט לטיול', desc: 'מה לארוז ומה לסדר לפני הטיסה' },
  { href: '#/currency', icon: '💱', title: 'ממיר מטבע', desc: 'שערים עדכניים, עובד גם בלי אינטרנט' },
  { href: '#/tips', icon: '💡', title: 'טיפים חשובים', desc: 'כסף, בריאות, ביטוח ובטיחות' },
  { href: '#/phrases', icon: '💬', title: 'משפטים שימושיים', desc: 'עם הגייה בעברית והשמעה' },
  { href: '#/faq', icon: '❓', title: 'שאלות נפוצות', desc: 'אמינות, פרטיות, אופליין ובטיחות' },
  { href: '#/about', icon: '🧭', title: 'על הפרויקט', desc: 'החזון, השוק, המתחרים ו־SWOT' },
];

export default function MorePage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const download = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trip-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('✅ הגיבוי ירד למכשיר. שמרו אותו בדרייב או שלחו לעצמכם במייל.');
  };

  const restore = async (file: File) => {
    if (!window.confirm('השחזור יחליף את המידע הנוכחי במכשיר (תכנון, צ׳קליסט ויומן). להמשיך?')) return;
    if (importBackup(await file.text())) {
      window.location.hash = '#/';
      window.location.reload();
    } else {
      setMessage('❌ הקובץ לא נראה כמו גיבוי של האפליקציה.');
    }
  };

  return (
    <>
      <PageHeader title="☰ עוד" />

      <ul className="country-list">
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} className="card country-card">
              <span className="flag" aria-hidden="true">
                {l.icon}
              </span>
              <span className="country-text">
                <strong>{l.title}</strong>
                <span className="muted">{l.desc}</span>
              </span>
              <span className="chevron" aria-hidden="true">
                ‹
              </span>
            </a>
          </li>
        ))}
      </ul>

      <h2 className="section-title">💾 גיבוי ושחזור</h2>
      <div className="card form-grid">
        <p className="muted small">
          כל המידע שלכם (תכנון, צ׳קליסט, יומן, הוצאות, ביקורות ומקומות שהוספתם) שמור רק על המכשיר הזה. אם הטלפון נגנב או מתקלקל – הוא ילך איתו. גבו מדי פעם!
        </p>
        <div className="form-actions">
          <button className="btn" onClick={download}>
            ⬇️ הורדת גיבוי
          </button>
          <button className="btn btn-secondary" onClick={() => fileInput.current?.click()}>
            ⬆️ שחזור מגיבוי
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void restore(file);
            e.target.value = '';
          }}
        />
        {message && <p className="small">{message}</p>}
      </div>
    </>
  );
}
