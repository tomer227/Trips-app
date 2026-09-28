import type { RegionId } from './types';

export interface ChecklistItem {
  id: string;
  label: string;
  /** Only show for a specific region; omitted = relevant everywhere */
  region?: RegionId;
  note?: string;
}

export interface ChecklistCategory {
  id: string;
  title: string;
  emoji: string;
  items: ChecklistItem[];
}

export const checklist: ChecklistCategory[] = [
  {
    id: 'before',
    title: 'לפני הטיסה',
    emoji: '📋',
    items: [
      { id: 'passport', label: 'דרכון בתוקף לפחות 6 חודשים מיום החזרה', note: 'ועם כמה עמודים ריקים לחותמות' },
      { id: 'insurance', label: 'ביטוח נסיעות כולל ספורט אתגרי, טרקים בגובה ופינוי' },
      { id: 'travel-clinic', label: 'ביקור במרפאת מטיילים (6–8 שבועות לפני)' },
      { id: 'yellow-card', label: 'פנקס חיסונים צהוב (קדחת צהובה)', region: 'south-america' },
      { id: 'cards', label: '2 כרטיסי אשראי מחברות שונות + הודעה לבנק על הטיול' },
      { id: 'copies', label: 'צילום דרכון, ביטוח וכרטיסים – בענן ובמייל' },
      { id: 'license', label: 'רישיון נהיגה בינלאומי (כולל אופנוע אם צריך)' },
      { id: 'esim', label: 'eSIM / חבילת גלישה לחו״ל' },
      { id: 'miluim', label: 'אישור יציאה לחו״ל (למי שחייב במילואים)' },
      { id: 'power-of-attorney', label: 'ייפוי כוח להורה/קרוב לענייני בנק ומסמכים' },
      { id: 'offline-maps', label: 'הורדת מפות אופליין (Maps.me / Google Maps)' },
    ],
  },
  {
    id: 'bag',
    title: 'תיק וציוד',
    emoji: '🎒',
    items: [
      { id: 'backpack', label: 'תרמיל 45–60 ליטר + תיק יום קטן' },
      { id: 'rain-cover', label: 'כיסוי גשם לתרמיל' },
      { id: 'packing-cubes', label: 'שקיות/קוביות אריזה' },
      { id: 'lock', label: 'מנעול קטן ללוקרים בהוסטלים' },
      { id: 'headlamp', label: 'פנס ראש' },
      { id: 'bottle', label: 'בקבוק מים עם פילטר' },
      { id: 'towel', label: 'מגבת מיקרופייבר' },
      { id: 'sleeping-bag', label: 'שק שינה (לטרקים ולאוטובוסי לילה)' },
      { id: 'money-belt', label: 'פאוץ׳ נסתר לכסף ולדרכון' },
      { id: 'dry-bag', label: 'שקית אטומה למים (שייט ואיים)', region: 'asia' },
    ],
  },
  {
    id: 'clothes',
    title: 'ביגוד',
    emoji: '👕',
    items: [
      { id: 'tshirts', label: '4–5 חולצות קצרות מבד מתייבש' },
      { id: 'long', label: '1–2 חולצות ארוכות ומכנס ארוך (מקדשים ויתושים)' },
      { id: 'fleece', label: 'פליז / פוך קל' },
      { id: 'rain-jacket', label: 'מעיל גשם' },
      { id: 'thermal', label: 'בגדים תרמיים (טרקים בגובה)' },
      { id: 'shoes', label: 'נעלי הליכה נוחות (שייחנו לפני הטיול!)' },
      { id: 'sandals', label: 'סנדלים / כפכפים' },
      { id: 'swim', label: 'בגד ים' },
      { id: 'hat', label: 'כובע שמש + כובע צמר' },
      { id: 'andes-layers', label: 'שכבות חמות לאנדים – לילות קפואים באויוני ובפטגוניה', region: 'south-america' },
    ],
  },
  {
    id: 'health',
    title: 'בריאות ותרופות',
    emoji: '💊',
    items: [
      { id: 'first-aid', label: 'ערכת עזרה ראשונה בסיסית' },
      { id: 'painkillers', label: 'משככי כאבים ומורידי חום' },
      { id: 'stomach', label: 'תרופות לשלשול + תמיסת מלחים (ORS)' },
      { id: 'antibiotics', label: 'אנטיביוטיקה לחירום (לפי המלצת רופא)' },
      { id: 'mosquito', label: 'דוחה יתושים עם DEET / איקרידין' },
      { id: 'sunscreen', label: 'קרם הגנה' },
      { id: 'personal-meds', label: 'תרופות קבועות + מרשם באנגלית' },
      { id: 'altitude', label: 'תרופה למחלת גבהים (לפי המלצת רופא)', note: 'להימלאיה ולאנדים' },
      { id: 'glasses', label: 'משקפיים/עדשות רזרביים' },
    ],
  },
  {
    id: 'tech',
    title: 'טכנולוגיה',
    emoji: '🔌',
    items: [
      { id: 'adapter', label: 'מתאם חשמל אוניברסלי' },
      { id: 'powerbank', label: 'סוללה ניידת (Power bank)' },
      { id: 'cables', label: 'כבלי טעינה רזרביים' },
      { id: 'headphones', label: 'אוזניות' },
      { id: 'phone-case', label: 'כיסוי עמיד/אטום לטלפון' },
      { id: 'apps', label: 'אפליקציות: Google Translate אופליין, Grab/Uber, Booking/Hostelworld, 12Go' },
    ],
  },
];
