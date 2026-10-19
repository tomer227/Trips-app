import { phraseBooks } from '../data/tips';
import { usePersistentState } from '../storage';
import PageHeader from '../components/PageHeader';

const voices: Record<string, string> = {
  spanish: 'es-ES',
  portuguese: 'pt-BR',
  thai: 'th-TH',
  hindi: 'hi-IN',
  vietnamese: 'vi-VN',
  indonesian: 'id-ID',
};

function speak(text: string, lang: string) {
  if (!('speechSynthesis' in window)) return;
  // Drop the romanised part in parentheses so the voice reads the native script.
  const utterance = new SpeechSynthesisUtterance(text.replace(/\(.*?\)/g, '').trim());
  utterance.lang = lang;
  utterance.rate = 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export default function PhrasesPage() {
  const [active, setActive] = usePersistentState('phrasebook', phraseBooks[0].id);
  const book = phraseBooks.find((b) => b.id === active) ?? phraseBooks[0];
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  return (
    <>
      <PageHeader title="💬 משפטים שימושיים" subtitle="עם הגייה בעברית. לחצו על 🔊 כדי לשמוע." />

      <nav className="chips" aria-label="בחירת שפה">
        {phraseBooks.map((b) => (
          <button key={b.id} className={`chip ${b.id === book.id ? 'active' : ''}`} onClick={() => setActive(b.id)} aria-pressed={b.id === book.id}>
            {b.flag} {b.language}
          </button>
        ))}
      </nav>

      <p className="muted">מדוברת ב: {book.where}</p>

      <ul className="phrases">
        {book.phrases.map((p) => (
          <li key={p.he} className="card phrase">
            <div>
              <div className="phrase-he">{p.he}</div>
              <div className="phrase-say">{p.say}</div>
              <div className="phrase-local" dir="ltr">
                {p.local}
              </div>
            </div>
            {canSpeak && (
              <button className="speak" onClick={() => speak(p.local, voices[book.id])} aria-label={`השמעת ${p.he}`}>
                🔊
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
