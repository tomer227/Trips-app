import { getCountry } from './data/countries';
import type { Journal, JournalEntry } from './journal';
import { myShareUsd } from './split';

export interface BookChapter {
  countryId: string;
  countryName: string;
  flag: string;
  from: string;
  to: string;
  entries: JournalEntry[];
  spentUsd: number;
}

export interface TripBook {
  chapters: BookChapter[];
  from?: string;
  to?: string;
  days: number;
  countries: number;
  entries: number;
  spentUsd: number;
}

const safe = (n: number) => (Number.isFinite(n) ? n : 0);

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * The journal as a book: memories oldest first, one chapter each time the traveller moved to
 * another country (coming back to a country opens a new chapter, like in the trip itself).
 */
export function buildTripBook(journal: Journal): TripBook {
  const entries = journal.entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.index - b.index)
    .map(({ entry }) => entry);

  const chapters: BookChapter[] = [];
  for (const entry of entries) {
    const last = chapters[chapters.length - 1];
    if (last && last.countryId === entry.countryId) {
      last.entries.push(entry);
      last.to = entry.date;
      continue;
    }
    const country = getCountry(entry.countryId);
    chapters.push({
      countryId: entry.countryId,
      countryName: country?.name ?? 'בדרכים',
      flag: country?.flag ?? '🌍',
      from: entry.date,
      to: entry.date,
      entries: [entry],
      spentUsd: 0,
    });
  }

  // Expenses go to the chapter of their country whose dates hold them, else the nearest one.
  for (const expense of journal.expenses) {
    const own = chapters.filter((c) => c.countryId === expense.countryId);
    if (own.length === 0) continue;
    const inside = own.find((c) => c.from <= expense.date && expense.date <= c.to);
    const target = inside ?? own.reduce((best, c) => (Math.abs(dayDiff(c.from, expense.date)) < Math.abs(dayDiff(best.from, expense.date)) ? c : best));
    target.spentUsd += safe(myShareUsd(expense));
  }

  const from = entries[0]?.date;
  const to = entries[entries.length - 1]?.date;
  return {
    chapters,
    from,
    to,
    days: from && to ? dayDiff(from, to) + 1 : 0,
    countries: new Set(entries.map((e) => e.countryId)).size,
    entries: entries.length,
    spentUsd: journal.expenses.reduce((sum, e) => sum + safe(myShareUsd(e)), 0),
  };
}
