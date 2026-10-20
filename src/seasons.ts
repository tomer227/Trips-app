import { getCountry } from './data/countries';

/**
 * Month-by-month season for each country, from the "best season" text in src/data/countries.ts.
 * g = good, o = in-between (fine for most, depends on the area), b = hard (heavy rain, storms).
 * Like the rest of the curated content this is general knowledge, not an official forecast.
 */
type Rating = 'g' | 'o' | 'b';

interface CountrySeason {
  /** 12 letters, January to December */
  months: string;
  /** Why the hard months are hard */
  bad?: string;
  /** Why the in-between months are in-between */
  mid?: string;
}

const RAIN = 'עונת גשמים';

export const SEASONS: Record<string, CountrySeason> = {
  thailand: { months: 'gggobbbbbbgg', bad: RAIN, mid: 'חם מאוד' },
  vietnam: { months: 'ggggoooobogg', bad: 'סופות במרכז ובצפון', mid: 'תלוי באזור' },
  laos: { months: 'ggggobbbbogg', bad: RAIN, mid: 'תחילת או סוף הגשמים' },
  cambodia: { months: 'ggggobbbbogg', bad: RAIN, mid: 'תחילת או סוף הגשמים' },
  india: { months: 'gggooooooggg', mid: 'חם במישורים או מונסון; עונה טובה בהרים' },
  nepal: { months: 'oogggbbbbggo', bad: 'מונסון, שבילים בוציים והרים מוסתרים', mid: 'קר בגובה' },
  'sri-lanka': { months: 'gggoooooooog', mid: 'טוב בחוף המזרחי, גשום במערב' },
  philippines: { months: 'gggggbbbbbbg', bad: 'עונת טייפונים' },
  japan: { months: 'oogggooooggo', mid: 'גשום, חם מאוד או קר' },
  indonesia: { months: 'bbbgggggggob', bad: RAIN, mid: 'תחילת הגשמים' },
  peru: { months: 'bbbogggggooo', bad: 'גשום באנדים, שביל האינקה סגור בפברואר', mid: 'מעבר בין העונות' },
  bolivia: { months: 'ooooggggggoo', mid: 'גשום, אבל אויוני מוצף ויפה (אפקט המראה)' },
  chile: { months: 'gggooooooogg', mid: 'פטגוניה קרה וחלקה סגורה; הצפון והמרכז בסדר' },
  argentina: { months: 'gggooooooogg', mid: 'פטגוניה קרה וחלקה סגורה; הצפון בסדר' },
  brazil: { months: 'gggooooogggg', mid: 'תלוי באזור' },
  colombia: { months: 'gggoooggooog', mid: 'גשום יותר' },
  ecuador: { months: 'oooooggggooo', mid: 'טוב כל השנה, קצת גשום יותר בהרים' },
  mexico: { months: 'ggggobbbbbgg', bad: 'גשמים, והוריקנים בחוף הקריבי', mid: 'חם, תחילת הגשמים' },
  guatemala: { months: 'ggggobbbbbgg', bad: RAIN, mid: 'תחילת הגשמים' },
  'costa-rica': { months: 'ggggoooobbog', bad: 'הכי גשום בצד הפסיפי', mid: '"העונה הירוקה": גשם אחר הצהריים' },
  panama: { months: 'ggggbbbbbbbg', bad: RAIN },
};

export const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export interface SeasonCheck {
  rating: Rating;
  /** Hebrew names of the weakest months in the stop */
  months: string[];
  note?: string;
}

/** Months (0-11) touched by an inclusive date range, in order. */
function monthsBetween(from: string, to: string): number[] {
  const out: number[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7)) - 1;
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7)) - 1;
  while ((y < endY || (y === endY && m <= endM)) && out.length < 24) {
    out.push(m);
    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

const RANK: Record<Rating, number> = { g: 0, o: 1, b: 2 };

/** The weakest season a stop runs into. Undefined when the country has no season data. */
export function checkSeason(countryId: string, from: string, to: string): SeasonCheck | undefined {
  const season = SEASONS[countryId];
  if (!season || !getCountry(countryId)) return undefined;
  const months = [...new Set(monthsBetween(from, to))];
  if (months.length === 0) return undefined;
  const worst = months.reduce<Rating>((w, m) => (RANK[season.months[m] as Rating] > RANK[w] ? (season.months[m] as Rating) : w), 'g');
  return {
    rating: worst,
    months: months.filter((m) => season.months[m] === worst).map((m) => MONTH_NAMES[m]),
    note: worst === 'b' ? season.bad : worst === 'o' ? season.mid : undefined,
  };
}

/** The good months of a country, for a hint like "הכי טוב: נובמבר, דצמבר...". */
export function goodMonths(countryId: string): string[] {
  const season = SEASONS[countryId];
  return season ? MONTH_NAMES.filter((_, m) => season.months[m] === 'g') : [];
}
