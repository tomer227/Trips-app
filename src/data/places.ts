export type PlaceCategory =
  | 'attraction'
  | 'food'
  | 'cafe'
  | 'sleep'
  | 'party'
  | 'festival'
  | 'gathering'
  | 'israeli'
  | 'service'
  | 'warning';

/** Where a place comes from – the UI labels each source differently. */
export type PlaceSource = 'local' | 'google';

export type PriceLevel = 'free' | 'inexpensive' | 'moderate' | 'expensive' | 'very_expensive';

/** How many Israelis you'll typically meet there – the "Israeli eye" */
export type IsraeliLevel = 'high' | 'some' | 'low';

export interface Place {
  id: string;
  countryId: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  desc: string;
  israeli?: IsraeliLevel;
  /** Months (1–12) when the place is at its best / the event happens */
  months?: number[];
  /** Human-readable timing for festivals, e.g. "24 ביוני" */
  when?: string;
  /** Safety note shown prominently on the place card */
  safety?: string;
  /** Added by the user on this device */
  custom?: boolean;

  /** Defaults to 'local' (curated by the app team or added by the user) */
  source?: PlaceSource;
  /** Google-sourced fields. Only present when Google returned them – never guessed. */
  googlePlaceId?: string;
  googleTypes?: string[];
  address?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: PriceLevel;
  /** true / false only when Google reported it; undefined = unknown */
  openNow?: boolean;
  openingHours?: string[];
  phone?: string;
  website?: string;
  googleMapsUri?: string;
  photoName?: string;
  /** Required by Google whenever the photo is shown */
  photoAttribution?: string;
  /** ISO time the external data was fetched */
  sourceUpdatedAt?: string;
}

export const categoryInfo: Record<PlaceCategory, { label: string; emoji: string; color: string }> = {
  attraction: { label: 'אטרקציה', emoji: '🏞️', color: '#16a34a' },
  food: { label: 'אוכל', emoji: '🍜', color: '#ea580c' },
  cafe: { label: 'קפה', emoji: '☕', color: '#a16207' },
  sleep: { label: 'לינה', emoji: '🛏️', color: '#2563eb' },
  party: { label: 'בר / מסיבה', emoji: '🎉', color: '#db2777' },
  festival: { label: 'פסטיבל', emoji: '🎊', color: '#9333ea' },
  gathering: { label: 'נקודת התארגנות', emoji: '🚩', color: '#0d9488' },
  israeli: { label: 'מוקד ישראלי', emoji: '🇮🇱', color: '#1d4ed8' },
  service: { label: 'שירותים', emoji: '🛒', color: '#475569' },
  warning: { label: 'אזהרה', emoji: '⚠️', color: '#dc2626' },
};

export const israeliLevelInfo: Record<IsraeliLevel, string> = {
  high: 'מוצף ישראלים 🇮🇱🇮🇱🇮🇱',
  some: 'יש ישראלים 🇮🇱',
  low: 'כמעט בלי ישראלים',
};

const ALL_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const places: Place[] = [
  // ───────────── Thailand ─────────────
  { id: 'khaosan', countryId: 'thailand', name: 'חאו סאן רוד, בנגקוק', category: 'gathering', lat: 13.759, lng: 100.497, israeli: 'high', months: ALL_YEAR, desc: 'נקודת הנחיתה הקלאסית: הוסטלים, ברים, סוכנויות נסיעות ומטיילים מכל העולם. מקום טוב למצוא שותפים להמשך.' },
  { id: 'bkk-chabad', countryId: 'thailand', name: 'חב״ד חאו סאן', category: 'israeli', lat: 13.7612, lng: 100.4948, israeli: 'high', months: ALL_YEAR, desc: 'ארוחות שישי ענקיות, אוכל כשר ועזרה ראשונה בכל עניין. נקודת מפגש לישראלים שרק נחתו.' },
  { id: 'yaowarat', countryId: 'thailand', name: 'יאוורט – צ׳יינה טאון, בנגקוק', category: 'food', lat: 13.7405, lng: 100.5095, israeli: 'some', months: ALL_YEAR, desc: 'אוכל הרחוב הכי טוב בבנגקוק, בעיקר בערב.' },
  { id: 'gem-scam', countryId: 'thailand', name: 'עוקץ ה"ארמון סגור היום"', category: 'warning', lat: 13.7500, lng: 100.4913, desc: 'ליד הארמון המלכותי ניגשים "מקומיים נחמדים", אומרים שהארמון סגור ומציעים טוקטוק זול – שמסתיים בחנות תכשיטים. פשוט להמשיך ללכת.' },
  { id: 'cm-walking', countryId: 'thailand', name: 'שוק הלילה של יום ראשון, צ׳יאנג מאי', category: 'food', lat: 18.7877, lng: 98.9931, israeli: 'some', months: ALL_YEAR, desc: 'רחוב שלם של אוכל, אומנות ומוזיקה בעיר העתיקה.' },
  { id: 'pai', countryId: 'thailand', name: 'פאי', category: 'gathering', lat: 19.358, lng: 98.4405, israeli: 'high', months: [11, 12, 1, 2, 3], desc: 'עיירת היפים בצפון: מפלים, קניון, מעיינות חמים ושוק לילה. יוצאים אליה באופנוע מצ׳יאנג מאי (762 פניות!).', safety: 'הדרך מצ׳יאנג מאי מפותלת מאוד – אם אתם לא רוכבים מנוסים, קחו מיניוואן.' },
  { id: 'haad-rin', countryId: 'thailand', name: 'האד רין – מסיבת הירח המלא', category: 'party', lat: 9.6765, lng: 100.0633, israeli: 'high', months: ALL_YEAR, when: 'כל חודש, סביב הירח המלא', desc: 'אלפי אנשים על החוף עד הזריחה. הזמינו לינה מראש – המקום מתמלא.', safety: 'השגיחו על ה"באקט" שלכם, היזהרו מאלכוהול מזויף ומסמים – יש פשיטות משטרה ועונשים כבדים.' },
  { id: 'koh-tao', countryId: 'thailand', name: 'קו טאו – צלילה', category: 'attraction', lat: 10.0956, lng: 99.8404, israeli: 'some', months: [3, 4, 5, 6, 7, 8, 9], desc: 'אחד המקומות הזולים בעולם להסמכת צלילה.' },
  { id: 'railay', countryId: 'thailand', name: 'ריילי, קראבי', category: 'attraction', lat: 8.0114, lng: 98.8384, israeli: 'some', months: [11, 12, 1, 2, 3, 4], desc: 'חצי אי שמגיעים אליו רק בסירה – צוקי גיר, טיפוס וחופים.' },
  { id: 'songkran', countryId: 'thailand', name: 'סונגקרן – ראש השנה התאילנדי', category: 'festival', lat: 18.7883, lng: 98.9853, months: [4], when: '13–15 באפריל', desc: 'מלחמת המים הגדולה בעולם. בצ׳יאנג מאי ובבנגקוק זה הכי מטורף. שקית אטומה לטלפון חובה.' },
  { id: 'yi-peng', countryId: 'thailand', name: 'יי פנג ולוי קראטונג', category: 'festival', lat: 18.795, lng: 99.0, months: [11], when: 'נובמבר (ירח מלא)', desc: 'אלפי פנסים עפים בשמיים של צ׳יאנג מאי ורפסודות פרחים על הנהר.' },

  // ───────────── Vietnam ─────────────
  { id: 'ta-hien', countryId: 'vietnam', name: 'רחוב הבירה טא הין, האנוי', category: 'party', lat: 21.0355, lng: 105.8522, israeli: 'some', months: ALL_YEAR, desc: 'שרפרפים קטנים, בירה בדולר ואווירה של הרובע העתיק.' },
  { id: 'ha-giang', countryId: 'vietnam', name: 'לופ הא ג׳יאנג', category: 'attraction', lat: 22.8233, lng: 104.9836, israeli: 'some', months: [9, 10, 11, 3, 4, 5], desc: 'מסלול האופנועים הכי יפה בדרום־מזרח אסיה.', safety: 'תאונות נפוצות מאוד. אם אין לכם ניסיון – קחו "איזי ריידר" (נהג מקומי) ורכבו מאחור.' },
  { id: 'hoi-an', countryId: 'vietnam', name: 'העיר העתיקה, הוי אן', category: 'attraction', lat: 15.8801, lng: 108.3380, israeli: 'some', months: [2, 3, 4, 5, 6, 7], desc: 'פנסים, חייטים ואוכל מעולה. בערב הנהר מתמלא בנרות.' },
  { id: 'phong-nha', countryId: 'vietnam', name: 'פונג נה', category: 'attraction', lat: 17.5906, lng: 106.2833, israeli: 'low', months: [3, 4, 5, 6, 7, 8], desc: 'מערות ענק, ג׳ונגל ורכיבה בין שדות אורז.' },
  { id: 'bui-vien', countryId: 'vietnam', name: 'בוי ויין, הו צ׳י מין', category: 'party', lat: 10.7673, lng: 106.6932, israeli: 'some', months: ALL_YEAR, desc: 'רחוב המסיבות של סייגון – רועש, זול וכאוטי.', safety: 'חטיפות טלפונים מאופנועים נפוצות – החזיקו את הטלפון רחוק מהכביש.' },
  { id: 'tet', countryId: 'vietnam', name: 'טט – ראש השנה הירחי', category: 'festival', lat: 21.028, lng: 105.834, months: [1, 2], when: 'סוף ינואר–פברואר (משתנה)', desc: 'החג הכי גדול בווייטנאם. חגיגי מאוד – אבל הרבה עסקים סגורים והתחבורה מלאה, הזמינו מראש.' },

  // ───────────── Laos ─────────────
  { id: 'kuang-si', countryId: 'laos', name: 'מפלי קואנג סי', category: 'attraction', lat: 19.7494, lng: 101.9936, israeli: 'some', months: [11, 12, 1, 2, 3, 4], desc: 'בריכות טורקיז מדורגות ליד לואנג פרבנג.' },
  { id: 'vang-vieng', countryId: 'laos', name: 'ואנג ויאנג', category: 'gathering', lat: 18.9235, lng: 102.4478, israeli: 'high', months: [11, 12, 1, 2, 3, 4], desc: 'טיובינג, מערות וכדור פורח. נקודת מפגש מרכזית בציר תאילנד–וייטנאם.', safety: 'טיובינג + אלכוהול = טביעות בעבר. אל תשחו שיכורים ובעונת הגשמים הנהר חזק.' },
  { id: 'nong-khiaw', countryId: 'laos', name: 'נונג קיאו', category: 'attraction', lat: 20.5694, lng: 102.6136, israeli: 'low', months: [11, 12, 1, 2, 3], desc: 'כפר שקט בין הרים עם תצפיות משוגעות.' },

  // ───────────── Cambodia ─────────────
  { id: 'angkor', countryId: 'cambodia', name: 'אנגקור וואט', category: 'attraction', lat: 13.4125, lng: 103.867, israeli: 'some', months: [11, 12, 1, 2, 3], desc: 'זריחה מעל המקדש הגדול בעולם. כרטיס ל־3 ימים שווה את זה.' },
  { id: 'pub-street', countryId: 'cambodia', name: 'פאב סטריט, סיאם ריפ', category: 'party', lat: 13.3547, lng: 103.8553, israeli: 'some', months: ALL_YEAR, desc: 'בירה בחצי דולר ושוק לילה.' },
  { id: 'koh-rong', countryId: 'cambodia', name: 'קו רונג', category: 'attraction', lat: 10.715, lng: 103.25, israeli: 'some', months: [11, 12, 1, 2, 3, 4], desc: 'חופים לבנים ופלנקטון זוהר.' },

  // ───────────── India ─────────────
  { id: 'paharganj', countryId: 'india', name: 'פהארגאנג׳ (מיין בזאר), דלהי', category: 'gathering', lat: 28.6448, lng: 77.2135, israeli: 'high', months: [10, 11, 12, 1, 2, 3], desc: 'אזור ההוסטלים הזולים מול תחנת הרכבת. כאוס מושלם ליום הראשון בהודו.', safety: 'בתחנת הרכבת יגידו לכם ש"משרד הכרטיסים סגור" ויפנו לסוכנות – זה עוקץ. יש משרד כרטיסים לתיירים בקומה הראשונה.' },
  { id: 'kasol', countryId: 'india', name: 'קסול, עמק פרווטי', category: 'gathering', lat: 32.0099, lng: 77.3148, israeli: 'high', months: [4, 5, 6, 9, 10], desc: 'לב "שביל החומוס": שלטים בעברית, שקשוקה ופלאפל, ונקודת יציאה לטרקים בעמק.', safety: 'סמים בהודו = עבירה חמורה (חוק NDPS), עם מאסר ארוך גם על כמויות קטנות. יש גם מקרי היעלמות בעמק – אל תטיילו לבד ועדכנו איפה אתם.' },
  { id: 'tosh', countryId: 'india', name: 'טוש', category: 'sleep', lat: 32.0167, lng: 77.4495, israeli: 'high', months: [5, 6, 9, 10], desc: 'כפר הררי בסוף העמק עם גסטהאוזים ונוף לשלג.' },
  { id: 'old-manali', countryId: 'india', name: 'מנאלי העתיקה', category: 'israeli', lat: 32.2536, lng: 77.1795, israeli: 'high', months: [4, 5, 6, 9, 10], desc: 'בתי קפה, חב״ד, והיציאה לספיטי וללדאק.' },
  { id: 'dharamkot', countryId: 'india', name: 'דרמקוט', category: 'israeli', lat: 32.2479, lng: 76.3301, israeli: 'high', months: [3, 4, 5, 6, 9, 10, 11], desc: 'כפר מעל מקלאוד גאנג׳ – יוגה, מדיטציה וטרק טריונד. חלק מרכזי בשביל הישראלי.' },
  { id: 'rishikesh', countryId: 'india', name: 'רישיקש', category: 'attraction', lat: 30.1262, lng: 78.3230, israeli: 'some', months: [2, 3, 4, 9, 10, 11], desc: 'בירת היוגה על הגנגס: אשרמים, גשרים תלויים ורפטינג.' },
  { id: 'pushkar', countryId: 'india', name: 'פושקר', category: 'israeli', lat: 26.4897, lng: 74.5511, israeli: 'high', months: [10, 11, 12, 1, 2, 3], desc: 'עיר קדושה סביב אגם, עם מסעדות בעברית וחב״ד פעיל.' },
  { id: 'pushkar-fair', countryId: 'india', name: 'יריד הגמלים של פושקר', category: 'festival', lat: 26.4843, lng: 74.5456, months: [11], when: 'נובמבר (לפי לוח השנה ההינדי)', desc: 'עשרות אלפי גמלים, סוחרים ועולי רגל. מחירי הלינה קופצים – הזמינו מראש.' },
  { id: 'holi', countryId: 'india', name: 'הולי – חג הצבעים', category: 'festival', lat: 27.5036, lng: 77.6723, months: [3], when: 'מרץ (ירח מלא)', desc: 'החגיגות הגדולות במתורה וורינדוואן, וגם בכל הודו ונפאל.', safety: 'מטיילות: באזורים הצפופים יש הטרדות רבות – עדיף לחגוג בקבוצה או בגסטהאוס.' },
  { id: 'hampi', countryId: 'india', name: 'המפי', category: 'attraction', lat: 15.335, lng: 76.46, israeli: 'some', months: [11, 12, 1, 2], desc: 'חורבות מקדשים בין סלעי ענק. טיפוס בולדרים וזריחות.' },
  { id: 'arambol', countryId: 'india', name: 'ארמבול, גואה', category: 'gathering', lat: 15.6868, lng: 73.7040, israeli: 'high', months: [12, 1, 2, 3], desc: 'חוף היפים בצפון גואה: מעגלי תופים בשקיעה וחב״ד גואה.' },
  { id: 'anjuna', countryId: 'india', name: 'אנג׳ונה – מסיבות טראנס', category: 'party', lat: 15.5736, lng: 73.7407, israeli: 'high', months: [12, 1, 2], desc: 'מקום הולדתו של גואה־טראנס. עונת המסיבות בדצמבר–ינואר.', safety: 'פשיטות משטרה על סמים נפוצות ועונשים חמורים.' },
  { id: 'varanasi', countryId: 'india', name: 'הגהאטים של ורנאסי', category: 'attraction', lat: 25.3067, lng: 83.0104, israeli: 'some', months: [10, 11, 12, 1, 2, 3], desc: 'טקס האארטי בערב והשייט בזריחה על הגנגס.' },
  { id: 'diwali', countryId: 'india', name: 'דיוואלי – חג האורות', category: 'festival', lat: 25.3176, lng: 82.9739, months: [10, 11], when: 'אוקטובר–נובמבר (משתנה)', desc: 'כל הודו מוארת בנרות וזיקוקים. בורנאסי ובג׳איפור זה מרהיב.' },

  // ───────────── Nepal ─────────────
  { id: 'thamel', countryId: 'nepal', name: 'תמל, קטמנדו', category: 'gathering', lat: 27.7152, lng: 85.3123, israeli: 'high', months: [3, 4, 10, 11], desc: 'רובע המטיילים: ציוד טרקים, סוכנויות, ומסעדות עם תפריט בעברית.' },
  { id: 'ktm-seder', countryId: 'nepal', name: 'ליל הסדר של חב״ד קטמנדו', category: 'festival', lat: 27.7172, lng: 85.3100, israeli: 'high', months: [3, 4], when: 'ערב פסח', desc: 'אחד מלילות הסדר הגדולים בעולם – מאות רבות של מטיילים ישראלים. הירשמו מראש.' },
  { id: 'pokhara', countryId: 'nepal', name: 'לייקסייד, פוקרה', category: 'sleep', lat: 28.2096, lng: 83.9570, israeli: 'high', months: [3, 4, 10, 11], desc: 'מנוחה אחרי טרק: אגם, מצנחי רחיפה ובתי קפה.' },
  { id: 'thorong-la', countryId: 'nepal', name: 'מעבר ת׳ורונג לה – סובב אנאפורנה', category: 'attraction', lat: 28.7939, lng: 83.9392, israeli: 'high', months: [3, 4, 10, 11], desc: 'הנקודה הגבוהה בסובב (5,416 מ׳). הזריחה במעבר – בלתי נשכחת.', safety: 'מחלת גבהים: עלו בהדרגה, ואם יש סימנים – רדו. ודאו שהביטוח מכסה פינוי במסוק.' },
  { id: 'ebc', countryId: 'nepal', name: 'בסיס האוורסט', category: 'attraction', lat: 28.0043, lng: 86.8571, israeli: 'some', months: [3, 4, 5, 10, 11], desc: 'טרק של כשבועיים עד מרגלות ההר הגבוה בעולם.', safety: 'הטיסה ללוקלה מבוטלת הרבה בגלל מזג אוויר – השאירו ימי באפר.' },
  { id: 'dashain', countryId: 'nepal', name: 'דשאין וטיהאר', category: 'festival', lat: 27.7041, lng: 85.3075, months: [10, 11], when: 'אוקטובר–נובמבר', desc: 'החגים הגדולים בנפאל – עפיפונים, נרות ומשפחות. הרבה עסקים סגורים ותחבורה עמוסה.' },

  // ───────────── Sri Lanka / Philippines / Japan / Indonesia ─────────────
  { id: 'ella', countryId: 'sri-lanka', name: 'אלה', category: 'attraction', lat: 6.8667, lng: 81.0466, israeli: 'some', months: [1, 2, 3, 12], desc: 'גשר תשע הקשתות, מטעי תה ותחנת הסיום של הרכבת היפה.' },
  { id: 'arugam', countryId: 'sri-lanka', name: 'ארוגם ביי', category: 'gathering', lat: 6.8402, lng: 81.8356, israeli: 'high', months: [5, 6, 7, 8, 9], desc: 'כפר גלישה שהפך לנקודת מפגש ישראלית מרכזית.' },
  { id: 'el-nido', countryId: 'philippines', name: 'אל נידו', category: 'attraction', lat: 11.1956, lng: 119.4020, israeli: 'some', months: [12, 1, 2, 3, 4, 5], desc: 'שייט "Island hopping" בין לגונות נסתרות.' },
  { id: 'siargao', countryId: 'philippines', name: 'סיארגאו', category: 'party', lat: 9.7871, lng: 126.1571, israeli: 'some', months: [3, 4, 5, 8, 9, 10], desc: 'גלישה ביום, מסיבות בג׳נרל לונה בלילה.' },
  { id: 'shibuya', countryId: 'japan', name: 'שיבויה, טוקיו', category: 'attraction', lat: 35.6595, lng: 139.7005, israeli: 'some', months: [3, 4, 5, 10, 11], desc: 'צומת ההולכי רגל המפורסם והחיים הלילה של טוקיו.' },
  { id: 'fushimi', countryId: 'japan', name: 'פושימי אינארי, קיוטו', category: 'attraction', lat: 34.9671, lng: 135.7727, israeli: 'some', months: [3, 4, 5, 10, 11], desc: 'אלפי שערי טוריי כתומים במעלה ההר. בואו מוקדם בבוקר.' },
  { id: 'ubud', countryId: 'indonesia', name: 'אובוד, באלי', category: 'attraction', lat: -8.5069, lng: 115.2625, israeli: 'low', months: [4, 5, 6, 7, 8, 9, 10], desc: 'טרסות אורז, יוגה ומקדשים.', safety: 'הכניסה לישראלים מחייבת ויזה מיוחדת מראש – בדקו לפני שמתכננים.' },
  { id: 'gili-t', countryId: 'indonesia', name: 'גילי טרוואנגן', category: 'party', lat: -8.3500, lng: 116.0400, israeli: 'low', months: [4, 5, 6, 7, 8, 9, 10], desc: 'אי בלי מכוניות: שנורקל עם צבים ומסיבות.' },

  // ───────────── Peru ─────────────
  { id: 'cusco-plaza', countryId: 'peru', name: 'פלאסה דה ארמס, קוסקו', category: 'gathering', lat: -13.5163, lng: -71.9786, israeli: 'high', months: [5, 6, 7, 8, 9], desc: 'לב קוסקו ונקודת המפגש של כל מי שבדרך למאצ׳ו פיצ׳ו.', safety: 'העיר בגובה 3,400 מ׳ – קחו יום־יומיים רגועים להתאקלמות.' },
  { id: 'cusco-chabad', countryId: 'peru', name: 'חב״ד קוסקו', category: 'israeli', lat: -13.5150, lng: -71.9770, israeli: 'high', months: ALL_YEAR, desc: 'מהגדולים ביבשת: ארוחות שישי למאות, שמירת ציוד ומידע עדכני על טרקים.' },
  { id: 'san-pedro-market', countryId: 'peru', name: 'שוק סן פדרו, קוסקו', category: 'food', lat: -13.5215, lng: -71.9844, israeli: 'some', months: ALL_YEAR, desc: 'מיצי פירות ענקיים וארוחות בכמה סולים.' },
  { id: 'machu-picchu', countryId: 'peru', name: 'מאצ׳ו פיצ׳ו', category: 'attraction', lat: -13.1631, lng: -72.5450, israeli: 'high', months: [4, 5, 6, 7, 8, 9, 10], desc: 'העיר האבודה של האינקה. דרך שביל האינקה, סלקנטאי או רכבת.', safety: 'כרטיסים נגמרים חודשים מראש בעונה – הזמינו רק באתר הרשמי.' },
  { id: 'inti-raymi', countryId: 'peru', name: 'אינטי ריימי – חג השמש', category: 'festival', lat: -13.5097, lng: -71.9817, months: [6], when: '24 ביוני', desc: 'טקס האינקה הגדול במצודת סקסאיוואמן. קוסקו מלאה עד אפס מקום – הזמינו לינה מוקדם.' },
  { id: 'rainbow', countryId: 'peru', name: 'הר הקשת (ויניקונקה)', category: 'attraction', lat: -13.8692, lng: -71.3028, israeli: 'high', months: [5, 6, 7, 8, 9], desc: 'טיול יום לגובה ~5,000 מ׳ עם הרים בפסים צבעוניים.' },
  { id: 'huacachina', countryId: 'peru', name: 'הואקצ׳ינה', category: 'party', lat: -14.0875, lng: -75.7633, israeli: 'high', months: ALL_YEAR, desc: 'נווה מדבר בין דיונות: באגי, סנדבורד ומסיבות בהוסטלים.' },
  { id: 'laguna-69', countryId: 'peru', name: 'לגונה 69, הוארז', category: 'attraction', lat: -9.0122, lng: -77.6100, israeli: 'some', months: [5, 6, 7, 8, 9], desc: 'אגם טורקיז למרגלות קרחון – טיול יום קשה ומתגמל.' },
  { id: 'miraflores', countryId: 'peru', name: 'מיראפלורס, לימה', category: 'sleep', lat: -12.1211, lng: -77.0297, israeli: 'some', months: ALL_YEAR, desc: 'השכונה הנוחה והבטוחה ללינה בלימה, על הצוקים מול האוקיינוס.' },

  // ───────────── Bolivia ─────────────
  { id: 'uyuni', countryId: 'bolivia', name: 'סלאר דה אויוני', category: 'attraction', lat: -20.1338, lng: -67.4891, israeli: 'high', months: [1, 2, 3, 5, 6, 7, 8, 9, 10], desc: 'מדבר המלח הגדול בעולם. בינואר–מרץ: אפקט המראה.', safety: 'בחרו חברת ג׳יפים לפי ביקורות עדכניות – היו תאונות קשות עם נהגים עייפים או שיכורים.' },
  { id: 'la-paz', countryId: 'bolivia', name: 'לה פאס – "שוטרים מזויפים"', category: 'warning', lat: -16.4955, lng: -68.1336, desc: 'עוקץ מוכר: "שוטר" בלבוש אזרחי מבקש לבדוק דרכון/כסף, לפעמים עם "תייר" שותף. שוטר אמיתי לא יבדוק ארנק ברחוב – בקשו ללכת לתחנה.' },
  { id: 'death-road', countryId: 'bolivia', name: 'דרך המוות', category: 'attraction', lat: -16.2900, lng: -67.8300, israeli: 'high', months: [4, 5, 6, 7, 8, 9, 10], desc: 'רכיבת אופני הרים במורד 3,500 מ׳ – מההרים לג׳ונגל.', safety: 'בחרו חברה עם אופניים ובלמים תקינים ומדריכים מנוסים – זה לא המקום לחסוך.' },
  { id: 'rurre', countryId: 'bolivia', name: 'רורנבקה – פמפס וג׳ונגל', category: 'attraction', lat: -14.4413, lng: -67.5278, israeli: 'high', months: [5, 6, 7, 8, 9, 10], desc: 'שייט בין תנינים, דולפינים ורודים וקופים.' },
  { id: 'oruro', countryId: 'bolivia', name: 'הקרנבל של אורורו', category: 'festival', lat: -17.9647, lng: -67.1060, months: [2, 3], when: 'פברואר–מרץ (לפני התענית)', desc: 'אחד הקרנבלים הגדולים ביבשת – ריקודי מסכות ושדים לאורך ימים.' },

  // ───────────── Chile ─────────────
  { id: 'torres', countryId: 'chile', name: 'טורס דל פיינה', category: 'attraction', lat: -50.9423, lng: -73.4068, israeli: 'high', months: [11, 12, 1, 2, 3], desc: 'טרק ה־W או ה־O – שלושת המגדלים בזריחה.', safety: 'חובה להזמין קמפינג/רפוחיו מראש. רוחות של 100+ קמ״ש – הכינו ציוד בהתאם.' },
  { id: 'atacama', countryId: 'chile', name: 'סן פדרו דה אטקמה', category: 'gathering', lat: -22.9087, lng: -68.1997, israeli: 'high', months: ALL_YEAR, desc: 'נקודת ההתארגנות לפני/אחרי אויוני: גייזרים, לגונות וסיורי כוכבים.' },
  { id: 'pucon', countryId: 'chile', name: 'פוקון', category: 'attraction', lat: -39.2822, lng: -71.9544, israeli: 'high', months: [12, 1, 2, 3], desc: 'טיפוס על הר הגעש הפעיל ויאריקה ומעיינות חמים.' },
  { id: 'valpo', countryId: 'chile', name: 'ולפראיסו', category: 'attraction', lat: -33.0472, lng: -71.6127, israeli: 'some', months: ALL_YEAR, desc: 'גבעות צבעוניות וגרפיטי.' },

  // ───────────── Argentina ─────────────
  { id: 'palermo', countryId: 'argentina', name: 'פלרמו, בואנוס איירס', category: 'party', lat: -34.5889, lng: -58.4306, israeli: 'some', months: ALL_YEAR, desc: 'ברים, מועדונים ו"בואליצ׳ים" – שום דבר לא מתחיל לפני 2 בלילה.' },
  { id: 'san-telmo', countryId: 'argentina', name: 'שוק סן טלמו', category: 'food', lat: -34.6211, lng: -58.3714, israeli: 'some', months: ALL_YEAR, desc: 'שוק ביום ראשון, טנגו ברחוב ואסאדו.' },
  { id: 'bariloche', countryId: 'argentina', name: 'ברילוצ׳ה', category: 'israeli', lat: -41.1335, lng: -71.3103, israeli: 'high', months: [11, 12, 1, 2, 3], desc: 'עיר האגמים עם אחד מבתי חב״ד המפורסמים ביבשת. בסיס לטרקים ולקטע הישראלי של פטגוניה.' },
  { id: 'el-chalten', countryId: 'argentina', name: 'אל צ׳אלטן', category: 'attraction', lat: -49.3314, lng: -72.8863, israeli: 'high', months: [11, 12, 1, 2, 3], desc: 'בירת הטרקים: לגונה דה לוס טרס מול הפיץ רוי. רוב המסלולים חינם.' },
  { id: 'perito', countryId: 'argentina', name: 'קרחון פריטו מורנו', category: 'attraction', lat: -50.4957, lng: -73.1377, israeli: 'high', months: [11, 12, 1, 2, 3], desc: 'קיר קרח ענק שמתנפץ לאגם מול העיניים.' },
  { id: 'iguazu', countryId: 'argentina', name: 'מפלי איגואסו', category: 'attraction', lat: -25.6953, lng: -54.4367, israeli: 'high', months: ALL_YEAR, desc: 'גרון השטן – כדאי לראות משני הצדדים (ארגנטינה וברזיל).' },
  { id: 'vendimia', countryId: 'argentina', name: 'פסטיבל הבציר, מנדוסה', category: 'festival', lat: -32.8895, lng: -68.8458, months: [3], when: 'תחילת מרץ', desc: 'חגיגות היין של מנדוסה – תהלוכות, מופעים ויקבים פתוחים.' },

  // ───────────── Brazil ─────────────
  { id: 'rio-carnival', countryId: 'brazil', name: 'הקרנבל של ריו', category: 'festival', lat: -22.9116, lng: -43.1967, months: [2, 3], when: 'פברואר–מרץ (לפני התענית)', desc: 'ה"בלוקוס" ברחובות בחינם ומצעד הסמבה בסמבודרום. המחירים מכפילים את עצמם.' },
  { id: 'copacabana-warning', countryId: 'brazil', name: 'חוף קופקבנה בלילה', category: 'warning', lat: -22.9711, lng: -43.1822, desc: 'שוד וחטיפות טלפונים נפוצים על החוף אחרי החשכה. בלילה – להישאר על הטיילת המוארת ולהסתובב בלי דברי ערך.' },
  { id: 'lapa', countryId: 'brazil', name: 'לאפה, ריו', category: 'party', lat: -22.9134, lng: -43.1800, israeli: 'some', months: ALL_YEAR, desc: 'מסיבת רחוב ענקית מתחת לקשתות בשישי ושבת.', safety: 'בואו ב־Uber, בלי תכשיטים ועם מעט כסף.' },
  { id: 'ilha-grande', countryId: 'brazil', name: 'אילה גרנדה', category: 'attraction', lat: -23.1400, lng: -44.1700, israeli: 'some', months: [9, 10, 11, 12, 1, 2, 3, 4], desc: 'אי בלי מכוניות, ג׳ונגל וחוף לופש מנדש.' },
  { id: 'lencois', countryId: 'brazil', name: 'לנסואיס מרנייאנסס', category: 'attraction', lat: -2.4855, lng: -43.1283, israeli: 'low', months: [6, 7, 8, 9], desc: 'דיונות לבנות עם לגונות מי גשם – רק באמצע השנה.' },

  // ───────────── Colombia ─────────────
  { id: 'cartagena', countryId: 'colombia', name: 'העיר העתיקה, קרטחנה', category: 'attraction', lat: 10.4236, lng: -75.5496, israeli: 'some', months: [12, 1, 2, 3, 4], desc: 'חומות, סמטאות צבעוניות ושקיעות על החומה.' },
  { id: 'comuna13', countryId: 'colombia', name: 'קומונה 13, מדיין', category: 'attraction', lat: 6.2566, lng: -75.6203, israeli: 'some', months: ALL_YEAR, desc: 'גרפיטי, היפ הופ וסיפור של שכונה שהשתנתה.' },
  { id: 'poblado', countryId: 'colombia', name: 'אל פובלדו, מדיין', category: 'party', lat: 6.2088, lng: -75.5673, israeli: 'high', months: ALL_YEAR, desc: 'אזור הברים וההוסטלים של מדיין.', safety: 'מקרים ידועים של סימום (סקופולמין) בדייטים ובמועדונים. לא לקבל משקאות מזרים ולא להביא הביתה אנשים שהכרתם עכשיו.' },
  { id: 'feria-flores', countryId: 'colombia', name: 'פסטיבל הפרחים, מדיין', category: 'festival', lat: 6.2442, lng: -75.5812, months: [8], when: 'תחילת אוגוסט', desc: 'מצעדי פרחים, מוזיקה והעיר כולה במסיבה.' },
  { id: 'barranquilla', countryId: 'colombia', name: 'הקרנבל של ברנקייה', category: 'festival', lat: 10.9685, lng: -74.7813, months: [2, 3], when: 'פברואר–מרץ', desc: 'הקרנבל השני בגודלו בעולם – 4 ימים של מסיבת רחוב.' },
  { id: 'salento', countryId: 'colombia', name: 'סלנטו ועמק קוקורה', category: 'attraction', lat: 4.6374, lng: -75.5701, israeli: 'some', months: [12, 1, 2, 3, 7, 8], desc: 'עצי דקל של 60 מטר ומטעי קפה.' },
  { id: 'palomino', countryId: 'colombia', name: 'פאלומינו', category: 'gathering', lat: 11.2436, lng: -73.5611, israeli: 'some', months: [12, 1, 2, 3, 7, 8], desc: 'כפר חוף רגוע – טיובינג בנהר, ערסלים ונקודת מפגש בדרך לטאיירונה.' },
  { id: 'ciudad-perdida', countryId: 'colombia', name: 'העיר האבודה', category: 'attraction', lat: 11.0381, lng: -73.9253, israeli: 'some', months: [12, 1, 2, 3, 6, 7, 8], desc: 'טרק 4–5 ימים בג׳ונגל לעיר עתיקה – רק עם חברה מורשית.' },

  // ───────────── Ecuador ─────────────
  { id: 'banos', countryId: 'ecuador', name: 'באניוס', category: 'gathering', lat: -1.3964, lng: -78.4247, israeli: 'high', months: ALL_YEAR, desc: 'בירת האקסטרים: נדנדת סוף העולם, קניונינג, רפטינג ואופניים במסלול המפלים.' },
  { id: 'quilotoa', countryId: 'ecuador', name: 'לופ קילוטואה', category: 'attraction', lat: -0.8556, lng: -78.9008, israeli: 'some', months: [6, 7, 8, 9], desc: 'טרק 3 ימים בין כפרים עד לוע הר געש עם לגונה.' },
  { id: 'montanita', countryId: 'ecuador', name: 'מונטניטה', category: 'party', lat: -1.8267, lng: -80.7533, israeli: 'high', months: [1, 2, 3, 4], desc: 'כפר גלישה ומסיבות על החוף.' },

  // ───────────── Mexico ─────────────
  { id: 'cdmx', countryId: 'mexico', name: 'רומה וקונדסה, מקסיקו סיטי', category: 'sleep', lat: 19.4150, lng: -99.1700, israeli: 'some', months: ALL_YEAR, desc: 'השכונות הנעימות ללינה: פארקים, בתי קפה וטאקוס בכל פינה.' },
  { id: 'dia-muertos', countryId: 'mexico', name: 'יום המתים, אוקסקה', category: 'festival', lat: 17.0654, lng: -96.7236, months: [10, 11], when: '31 באוקטובר – 2 בנובמבר', desc: 'בתי קברות מוארים בנרות, מזבחות ותהלוכות. באוקסקה ובמקסיקו סיטי זה הכי מרשים.' },
  { id: 'san-cristobal', countryId: 'mexico', name: 'סן קריסטובל דה לאס קאסס', category: 'gathering', lat: 16.7370, lng: -92.6376, israeli: 'high', months: [11, 12, 1, 2, 3, 4], desc: 'עיירה הררית קולוניאלית ונקודת מפגש בדרך לגואטמלה.' },
  { id: 'tulum', countryId: 'mexico', name: 'טולום', category: 'party', lat: 20.2114, lng: -87.4654, israeli: 'some', months: [11, 12, 1, 2, 3, 4], desc: 'חורבות מאיה על הים, צנוטות ומסיבות ג׳ונגל.', safety: 'במסיבות הג׳ונגל היו אירועי אלימות וסמים מסוכנים – היזהרו.' },
  { id: 'bacalar', countryId: 'mexico', name: 'באקאלאר', category: 'attraction', lat: 18.6776, lng: -88.3925, israeli: 'some', months: [11, 12, 1, 2, 3, 4], desc: 'לגונת שבעת הצבעים – קיאקים וסאפ בזריחה.' },
  { id: 'cenotes', countryId: 'mexico', name: 'צנוטות ליד ויאדוליד', category: 'attraction', lat: 20.6896, lng: -88.2011, israeli: 'some', months: ALL_YEAR, desc: 'בולענים עם מים צלולים – שחייה במערות. לוקחים אופניים ועוברים בין כמה.' },

  // ───────────── Guatemala ─────────────
  { id: 'antigua', countryId: 'guatemala', name: 'אנטיגואה', category: 'gathering', lat: 14.5586, lng: -90.7295, israeli: 'high', months: [11, 12, 1, 2, 3, 4], desc: 'עיר קולוניאלית, בתי ספר לספרדית ונקודת יציאה לאקטננגו.' },
  { id: 'semana-santa', countryId: 'guatemala', name: 'סמנה סנטה, אנטיגואה', category: 'festival', lat: 14.5568, lng: -90.7338, months: [3, 4], when: 'השבוע שלפני פסחא', desc: 'שטיחי פרחים ענקיים ברחובות ותהלוכות. הלינה מתמלאת חודשים מראש.' },
  { id: 'acatenango', countryId: 'guatemala', name: 'הר הגעש אקטננגו', category: 'attraction', lat: 14.5010, lng: -90.8760, israeli: 'high', months: [11, 12, 1, 2, 3, 4], desc: 'לינה בגובה ~3,700 מ׳ מול הר פואגו שמתפרץ כל כמה דקות.', safety: 'קר מאוד בלילה – שכבות חמות וכפפות. צאו רק עם חברה מוכרת.' },
  { id: 'san-pedro', countryId: 'guatemala', name: 'סן פדרו לה לגונה, אגם אטיטלן', category: 'gathering', lat: 14.6930, lng: -91.2720, israeli: 'high', months: [11, 12, 1, 2, 3, 4], desc: 'כפר על האגם שהפך לתחנה ישראלית: הוסטלים זולים, קייקים ושקיעות.' },
  { id: 'semuc', countryId: 'guatemala', name: 'סמוק שאמפיי', category: 'attraction', lat: 15.5333, lng: -89.9601, israeli: 'some', months: [11, 12, 1, 2, 3, 4], desc: 'בריכות טורקיז ומערה עם נרות.' },
  { id: 'tikal', countryId: 'guatemala', name: 'טיקאל', category: 'attraction', lat: 17.2220, lng: -89.6237, israeli: 'some', months: [11, 12, 1, 2, 3, 4], desc: 'פירמידות מאיה מעל צמרות הג׳ונגל – זריחה עם קופי יללן.' },

  // ───────────── Costa Rica / Panama ─────────────
  { id: 'la-fortuna', countryId: 'costa-rica', name: 'לה פורטונה', category: 'attraction', lat: 10.4678, lng: -84.6427, israeli: 'some', months: [12, 1, 2, 3, 4], desc: 'הר הגעש ארנל, מפלים ונהרות חמים בחינם.' },
  { id: 'puerto-viejo', countryId: 'costa-rica', name: 'פוארטו ויחו', category: 'party', lat: 9.6560, lng: -82.7540, israeli: 'some', months: [9, 10, 2, 3], desc: 'חוף קריבי, רגאיי ואופניים בין חופים.' },
  { id: 'san-blas', countryId: 'panama', name: 'איי סן בלאס', category: 'attraction', lat: 9.5500, lng: -78.9500, israeli: 'high', months: [12, 1, 2, 3, 4], desc: 'איים קריביים של שבט הגונה, ושייט של 3–5 ימים לקולומביה.', safety: 'בחרו שייט עם רישיון וציוד בטיחות – יש הבדלים גדולים בין החברות.' },
  { id: 'bocas', countryId: 'panama', name: 'בוקאס דל טורו', category: 'party', lat: 9.3400, lng: -82.2420, israeli: 'some', months: [9, 10, 2, 3], desc: 'ארכיפלג עם מסיבות על סירות ושנורקל.' },
];

export function isInSeason(place: Place, month: number): boolean {
  return !place.months || place.months.includes(month);
}

/** Month names for the "what's hot" section */
export const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** e.g. [11,12,1,2,3] → "נובמבר–מרץ" */
export function monthRange(months: number[]): string {
  const set = new Set(months);
  // Find a month in the set whose previous month isn't – that's where a run starts (handles wrap-around).
  const starts = months.filter((m) => !set.has(((m + 10) % 12) + 1));
  const runs = starts.map((start) => {
    let end = start;
    while (set.has((end % 12) + 1) && (end % 12) + 1 !== start) end = (end % 12) + 1;
    return start === end ? monthNames[start - 1] : `${monthNames[start - 1]}–${monthNames[end - 1]}`;
  });
  return runs.length ? runs.join(', ') : 'כל השנה';
}
