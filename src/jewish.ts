/**
 * Shabbat times and Jewish holidays for travellers – computed on the device, so it works offline.
 * Sun times use the NOAA "Almanac for Computers" algorithm (accurate to a minute or two);
 * Hebrew dates come from the browser's built-in Hebrew calendar (Intl).
 */

export interface City {
  id: string;
  countryId: string;
  name: string;
  lat: number;
  lng: number;
  tz: string;
}

/** Backpacker hubs, most of them with a Chabad house nearby. */
export const cities: City[] = [
  { id: 'bangkok', countryId: 'thailand', name: 'בנגקוק', lat: 13.7563, lng: 100.5018, tz: 'Asia/Bangkok' },
  { id: 'chiang-mai', countryId: 'thailand', name: 'צ׳יאנג מאי', lat: 18.7883, lng: 98.9853, tz: 'Asia/Bangkok' },
  { id: 'koh-phangan', countryId: 'thailand', name: 'קו פנגן', lat: 9.7319, lng: 100.0136, tz: 'Asia/Bangkok' },
  { id: 'hanoi', countryId: 'vietnam', name: 'האנוי', lat: 21.0285, lng: 105.8542, tz: 'Asia/Ho_Chi_Minh' },
  { id: 'saigon', countryId: 'vietnam', name: 'הו צ׳י מין', lat: 10.7769, lng: 106.7009, tz: 'Asia/Ho_Chi_Minh' },
  { id: 'luang-prabang', countryId: 'laos', name: 'לואנג פרבנג', lat: 19.8856, lng: 102.1347, tz: 'Asia/Vientiane' },
  { id: 'siem-reap', countryId: 'cambodia', name: 'סיאם ריפ', lat: 13.3633, lng: 103.8564, tz: 'Asia/Phnom_Penh' },
  { id: 'delhi', countryId: 'india', name: 'דלהי', lat: 28.6139, lng: 77.209, tz: 'Asia/Kolkata' },
  { id: 'manali', countryId: 'india', name: 'מנאלי', lat: 32.2432, lng: 77.1892, tz: 'Asia/Kolkata' },
  { id: 'dharamshala', countryId: 'india', name: 'דרמסלה', lat: 32.219, lng: 76.3234, tz: 'Asia/Kolkata' },
  { id: 'goa', countryId: 'india', name: 'גואה (ארמבול)', lat: 15.6869, lng: 73.7042, tz: 'Asia/Kolkata' },
  { id: 'kathmandu', countryId: 'nepal', name: 'קטמנדו', lat: 27.7172, lng: 85.324, tz: 'Asia/Kathmandu' },
  { id: 'pokhara', countryId: 'nepal', name: 'פוקרה', lat: 28.2096, lng: 83.9856, tz: 'Asia/Kathmandu' },
  { id: 'colombo', countryId: 'sri-lanka', name: 'קולומבו', lat: 6.9271, lng: 79.8612, tz: 'Asia/Colombo' },
  { id: 'arugam-bay', countryId: 'sri-lanka', name: 'ארוגם ביי', lat: 6.84, lng: 81.835, tz: 'Asia/Colombo' },
  { id: 'manila', countryId: 'philippines', name: 'מנילה', lat: 14.5995, lng: 120.9842, tz: 'Asia/Manila' },
  { id: 'el-nido', countryId: 'philippines', name: 'אל נידו', lat: 11.1956, lng: 119.4075, tz: 'Asia/Manila' },
  { id: 'tokyo', countryId: 'japan', name: 'טוקיו', lat: 35.6762, lng: 139.6503, tz: 'Asia/Tokyo' },
  { id: 'kyoto', countryId: 'japan', name: 'קיוטו', lat: 35.0116, lng: 135.7681, tz: 'Asia/Tokyo' },
  { id: 'bali', countryId: 'indonesia', name: 'באלי (אובוד)', lat: -8.5069, lng: 115.2625, tz: 'Asia/Makassar' },
  { id: 'lima', countryId: 'peru', name: 'לימה', lat: -12.0464, lng: -77.0428, tz: 'America/Lima' },
  { id: 'cusco', countryId: 'peru', name: 'קוסקו', lat: -13.532, lng: -71.9675, tz: 'America/Lima' },
  { id: 'la-paz', countryId: 'bolivia', name: 'לה פאס', lat: -16.4897, lng: -68.1193, tz: 'America/La_Paz' },
  { id: 'uyuni', countryId: 'bolivia', name: 'אויוני', lat: -20.46, lng: -66.825, tz: 'America/La_Paz' },
  { id: 'santiago', countryId: 'chile', name: 'סנטיאגו', lat: -33.4489, lng: -70.6693, tz: 'America/Santiago' },
  { id: 'puerto-natales', countryId: 'chile', name: 'פוארטו נטאלס', lat: -51.7236, lng: -72.4875, tz: 'America/Punta_Arenas' },
  { id: 'buenos-aires', countryId: 'argentina', name: 'בואנוס איירס', lat: -34.6037, lng: -58.3816, tz: 'America/Argentina/Buenos_Aires' },
  { id: 'bariloche', countryId: 'argentina', name: 'ברילוצ׳ה', lat: -41.1335, lng: -71.3103, tz: 'America/Argentina/Buenos_Aires' },
  { id: 'rio', countryId: 'brazil', name: 'ריו דה ז׳נרו', lat: -22.9068, lng: -43.1729, tz: 'America/Sao_Paulo' },
  { id: 'bogota', countryId: 'colombia', name: 'בוגוטה', lat: 4.711, lng: -74.0721, tz: 'America/Bogota' },
  { id: 'medellin', countryId: 'colombia', name: 'מדיין', lat: 6.2442, lng: -75.5812, tz: 'America/Bogota' },
  { id: 'quito', countryId: 'ecuador', name: 'קיטו', lat: -0.1807, lng: -78.4678, tz: 'America/Guayaquil' },
  { id: 'mexico-city', countryId: 'mexico', name: 'מקסיקו סיטי', lat: 19.4326, lng: -99.1332, tz: 'America/Mexico_City' },
  { id: 'playa', countryId: 'mexico', name: 'פלאיה דל כרמן', lat: 20.6296, lng: -87.0739, tz: 'America/Cancun' },
  { id: 'antigua', countryId: 'guatemala', name: 'אנטיגואה', lat: 14.5586, lng: -90.7295, tz: 'America/Guatemala' },
  { id: 'san-jose', countryId: 'costa-rica', name: 'סן חוסה', lat: 9.9281, lng: -84.0907, tz: 'America/Costa_Rica' },
  { id: 'panama-city', countryId: 'panama', name: 'פנמה סיטי', lat: 8.9824, lng: -79.5199, tz: 'America/Panama' },
];

export function getCity(id: string): City | undefined {
  return cities.find((c) => c.id === id);
}

// ─── Sun times ───

const rad = Math.PI / 180;
/** Official sunset: the sun's upper edge on the horizon, with refraction. */
export const ZENITH_SUNSET = 90.833;
/** Three medium stars – the common end of Shabbat (sun 8.5° below the horizon). */
export const ZENITH_TZEIT = 98.5;

const norm = (v: number, max: number) => ((v % max) + max) % max;

/**
 * Time of sunset (or a given depression below the horizon) on a local calendar date.
 * Returns a UTC timestamp, or null when the sun doesn't get that low (polar summer).
 */
export function sunsetAt(isoDate: string, lat: number, lng: number, zenith = ZENITH_SUNSET): number | null {
  const [y, m, d] = isoDate.split('-').map(Number);
  const midnightUtc = Date.UTC(y, m - 1, d);
  const dayOfYear = Math.round((midnightUtc - Date.UTC(y, 0, 1)) / 86400000) + 1;
  const lngHour = lng / 15;
  const t = dayOfYear + (18 - lngHour) / 24;

  const M = 0.9856 * t - 3.289;
  const L = norm(M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634, 360);
  let RA = norm(Math.atan(0.91764 * Math.tan(L * rad)) / rad, 360);
  RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;

  const sinDec = 0.39782 * Math.sin(L * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(zenith * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
  if (cosH > 1 || cosH < -1) return null;

  const H = Math.acos(cosH) / rad / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  // The event is in the local evening, i.e. around 18:00 solar time – pick the UTC hour closest to that.
  const expected = 18 - lngHour;
  let ut = norm(T - lngHour, 24);
  while (ut - expected > 12) ut -= 24;
  while (expected - ut > 12) ut += 24;
  return midnightUtc + ut * 3600000;
}

export const CANDLE_MINUTES = 18;

export interface ShabbatTimes {
  friday: string;
  saturday: string;
  candles: number | null;
  havdalah: number | null;
}

export function shabbatTimes(friday: string, lat: number, lng: number): ShabbatTimes {
  const saturday = addDays(friday, 1);
  const sunset = sunsetAt(friday, lat, lng);
  return {
    friday,
    saturday,
    candles: sunset === null ? null : sunset - CANDLE_MINUTES * 60000,
    havdalah: sunsetAt(saturday, lat, lng, ZENITH_TZEIT),
  };
}

// ─── Dates ───

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function weekday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Today's date (YYYY-MM-DD) in a time zone – falls back to the device's zone. */
export function todayIn(tz: string | undefined, now = Date.now()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
}

/** The Friday of the current Shabbat on Saturday, otherwise the coming Friday (today if it's Friday). */
export function upcomingFriday(today: string): string {
  const wd = weekday(today);
  return wd === 6 ? addDays(today, -1) : addDays(today, (5 - wd + 7) % 7);
}

export function formatTime(ts: number, tz?: string): string {
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz };
  try {
    return new Intl.DateTimeFormat('he-IL', opts).format(ts);
  } catch {
    return new Intl.DateTimeFormat('he-IL', { ...opts, timeZone: undefined }).format(ts);
  }
}

const hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export function formatDayHe(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `יום ${hebrewDays[weekday(iso)]}, ${d}.${m}`;
}

// ─── Hebrew calendar ───

export interface HebrewDate {
  day: number;
  /** English month name as Intl prints it: Tishri, Heshvan, Kislev, … Adar, Adar I, Adar II, Nisan, … */
  month: string;
  year: number;
}

let hebrewFormat: Intl.DateTimeFormat | null | undefined;
let hebrewLabelFormat: Intl.DateTimeFormat | null | undefined;

function getFormat(locale: string): Intl.DateTimeFormat | null {
  try {
    const f = new Intl.DateTimeFormat(`${locale}-u-ca-hebrew`, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
    return f.resolvedOptions().calendar === 'hebrew' ? f : null;
  } catch {
    return null;
  }
}

/** Whether this browser can do Hebrew dates (all modern ones can). */
export function hebrewCalendarSupported(): boolean {
  if (hebrewFormat === undefined) hebrewFormat = getFormat('en');
  return hebrewFormat !== null;
}

export function hebrewDate(iso: string): HebrewDate | null {
  if (!hebrewCalendarSupported() || !hebrewFormat) return null;
  const parts = hebrewFormat.formatToParts(new Date(`${iso}T12:00:00Z`));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: Number(get('day')), month: get('month'), year: Number(get('year')) };
}

/** e.g. "15 בניסן 5787" */
export function hebrewDateLabel(iso: string): string {
  if (hebrewLabelFormat === undefined) hebrewLabelFormat = getFormat('he');
  return hebrewLabelFormat ? hebrewLabelFormat.format(new Date(`${iso}T12:00:00Z`)) : '';
}

export type HolidayId =
  | 'rosh-hashana'
  | 'yom-kippur'
  | 'sukkot'
  | 'simchat-torah'
  | 'hanukkah'
  | 'tu-bishvat'
  | 'purim'
  | 'pesach'
  | 'yom-hazikaron'
  | 'yom-haatzmaut'
  | 'lag-baomer'
  | 'shavuot'
  | 'tisha-bav';

export interface HolidayInfo {
  name: string;
  emoji: string;
  /** How many days it lasts (as kept in Israel) */
  days: number;
  /** Starts the evening before */
  eve: boolean;
  /** What it looks like on the hummus trail */
  onTheRoad: string;
}

export const holidayInfo: Record<HolidayId, HolidayInfo> = {
  'rosh-hashana': {
    name: 'ראש השנה',
    emoji: '🍎',
    days: 2,
    eve: true,
    onTheRoad: 'בתי חב״ד עורכים ארוחות חג גדולות – בבנגקוק, בקטמנדו ובקוסקו מגיעים מאות מטיילים. נרשמים מראש באתר בית חב״ד.',
  },
  'yom-kippur': {
    name: 'יום כיפור',
    emoji: '🕊️',
    days: 1,
    eve: true,
    onTheRoad: 'תפילות וסעודה מפסקת בבתי חב״ד. אל תתכננו טרק או נסיעה ארוכה ביום הזה, וקחו בחשבון חום ושתייה.',
  },
  sukkot: {
    name: 'סוכות',
    emoji: '🌿',
    days: 7,
    eve: true,
    onTheRoad: 'בבתי חב״ד בונים סוכה ומזמינים לארוחות. טוב לדעת: חול המועד הוא עונת שיא של מטיילים ישראלים.',
  },
  'simchat-torah': {
    name: 'שמחת תורה',
    emoji: '📜',
    days: 1,
    eve: true,
    onTheRoad: 'הקפות בבתי חב״ד – לרוב מסיבה של ממש עם מטיילים מכל העולם.',
  },
  hanukkah: {
    name: 'חנוכה',
    emoji: '🕎',
    days: 8,
    eve: true,
    onTheRoad: 'הדלקות נרות פומביות בבתי חב״ד ובאכסניות ישראליות. אפשר לבקש חנוכייה ונרות בבית חב״ד הקרוב.',
  },
  'tu-bishvat': {
    name: 'ט״ו בשבט',
    emoji: '🌳',
    days: 1,
    eve: true,
    onTheRoad: 'סדר ט״ו בשבט עם פירות טרופיים – יש בתי חב״ד שעורכים ערב קטן.',
  },
  purim: {
    name: 'פורים',
    emoji: '🎭',
    days: 1,
    eve: true,
    onTheRoad: 'קריאת מגילה ומסיבות תחפושות בבתי חב״ד – מהמסיבות הישראליות הגדולות בשביל. שימו לב לאלכוהול מזויף.',
  },
  pesach: {
    name: 'פסח',
    emoji: '🍷',
    days: 7,
    eve: true,
    onTheRoad: 'ליל הסדר של חב״ד בקטמנדו הוא מהגדולים בעולם (אלפי משתתפים), ויש סדרים גדולים גם בבנגקוק, בקוסקו ובמנאלי. נרשמים מראש!',
  },
  'yom-hazikaron': {
    name: 'יום הזיכרון',
    emoji: '🕯️',
    days: 1,
    eve: true,
    onTheRoad: 'טקסי זיכרון בשגרירויות ובבתי חב״ד. בדקו בעמוד השגרירות הקרובה מתי ואיפה.',
  },
  'yom-haatzmaut': {
    name: 'יום העצמאות',
    emoji: '🇮🇱',
    days: 1,
    eve: true,
    onTheRoad: 'ערבי עצמאות ומנגלים בבתי חב״ד ובאכסניות ישראליות לאורך השביל.',
  },
  'lag-baomer': {
    name: 'ל״ג בעומר',
    emoji: '🔥',
    days: 1,
    eve: true,
    onTheRoad: 'מדורות במקומות עם הרבה ישראלים – בדרך כלל בהודו ובדרום אמריקה.',
  },
  shavuot: {
    name: 'שבועות',
    emoji: '🧀',
    days: 1,
    eve: true,
    onTheRoad: 'לימוד ליל שבועות וארוחה חלבית בבתי חב״ד.',
  },
  'tisha-bav': {
    name: 'תשעה באב',
    emoji: '🖤',
    days: 1,
    eve: true,
    onTheRoad: 'צום מהשקיעה עד צאת הכוכבים. קריאת איכה בבתי חב״ד.',
  },
};

/** Which holiday (if any) begins on this civil date. Exported for tests. */
export function holidayOn(iso: string): HolidayId | null {
  const h = hebrewDate(iso);
  if (!h) return null;
  const { day, month } = h;
  if (month === 'Tishri') {
    if (day === 1) return 'rosh-hashana';
    if (day === 10) return 'yom-kippur';
    if (day === 15) return 'sukkot';
    if (day === 22) return 'simchat-torah';
  }
  if (month === 'Kislev' && day === 25) return 'hanukkah';
  if (month === 'Shevat' && day === 15) return 'tu-bishvat';
  if ((month === 'Adar' || month === 'Adar II') && day === 14) return 'purim';
  if (month === 'Nisan' && day === 15) return 'pesach';
  if (month === 'Iyar') {
    if (day === 18) return 'lag-baomer';
    // Independence Day moves so that it and Memorial Day don't touch Shabbat.
    const fifth = weekday(addDays(iso, 5 - day));
    const atzmaut = fifth === 5 ? 4 : fifth === 6 ? 3 : fifth === 1 ? 6 : 5;
    if (day === atzmaut) return 'yom-haatzmaut';
    if (day === atzmaut - 1) return 'yom-hazikaron';
  }
  if (month === 'Sivan' && day === 6) return 'shavuot';
  if (month === 'Av') {
    // The fast is pushed to Sunday when 9 Av is Shabbat.
    if (day === 9 && weekday(iso) !== 6) return 'tisha-bav';
    if (day === 10 && weekday(addDays(iso, -1)) === 6) return 'tisha-bav';
  }
  return null;
}

export interface UpcomingHoliday {
  id: HolidayId;
  /** First day of the holiday (it starts the evening before) */
  date: string;
  hebrew: string;
  inDays: number;
}

/** Holidays from today (including ones in progress) for the next `horizonDays`. */
export function upcomingHolidays(today: string, horizonDays = 365): UpcomingHoliday[] {
  const found: UpcomingHoliday[] = [];
  // Look back a week so a holiday that's happening right now (Sukkot, Hanukkah, Pesach) still shows.
  for (let offset = -7; offset <= horizonDays; offset++) {
    const date = addDays(today, offset);
    const id = holidayOn(date);
    if (!id) continue;
    if (offset < 0 && offset + holidayInfo[id].days <= 0) continue;
    found.push({ id, date, hebrew: hebrewDateLabel(date), inDays: offset });
  }
  return found;
}
