import { getCountry } from './data/countries';
import type { TripPlan } from './budget';

export type Mood = '🤩' | '😊' | '😐' | '😩';

export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  countryId: string;
  title: string;
  text: string;
  mood: Mood;
}

export type ExpenseCategory = 'sleep' | 'food' | 'transport' | 'activities' | 'shopping' | 'other';

export interface Expense {
  id: string;
  date: string;
  countryId: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  /** USD value at the time of entry, so totals don't drift when rates change */
  amountUsd: number;
  note: string;
}

export interface Journal {
  entries: JournalEntry[];
  expenses: Expense[];
}

export const emptyJournal: Journal = { entries: [], expenses: [] };

export const categories: Record<ExpenseCategory, { label: string; emoji: string }> = {
  sleep: { label: 'לינה', emoji: '🛏️' },
  food: { label: 'אוכל', emoji: '🍜' },
  transport: { label: 'תחבורה', emoji: '🚌' },
  activities: { label: 'אטרקציות', emoji: '🎟️' },
  shopping: { label: 'קניות', emoji: '🛍️' },
  other: { label: 'אחר', emoji: '📦' },
};

export const moods: Mood[] = ['🤩', '😊', '😐', '😩'];

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${Number(d)}.${Number(m)}.${y}` : iso;
}

/** Newest first; same-day items keep their insertion order reversed (latest on top). */
export function sortByDateDesc<T extends { date: string }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.date.localeCompare(a.item.date) || b.index - a.index)
    .map(({ item }) => item);
}

export interface ExpenseSummary {
  totalUsd: number;
  days: number;
  perDayUsd: number;
  byCategory: { category: ExpenseCategory; usd: number }[];
  byCountry: { countryId: string; usd: number; plannedPerDayUsd: number | null; days: number }[];
}

/** Sum expenses, split by category and country, and compare to the planned daily budget. */
export function summarizeExpenses(expenses: Expense[], plan: TripPlan): ExpenseSummary {
  const styleIndex = plan.style === 'low' ? 0 : 1;
  const totalUsd = expenses.reduce((s, e) => s + e.amountUsd, 0);
  const allDays = new Set(expenses.map((e) => e.date));

  const catMap = new Map<ExpenseCategory, number>();
  const countryMap = new Map<string, { usd: number; days: Set<string> }>();
  for (const e of expenses) {
    catMap.set(e.category, (catMap.get(e.category) ?? 0) + e.amountUsd);
    const c = countryMap.get(e.countryId) ?? { usd: 0, days: new Set<string>() };
    c.usd += e.amountUsd;
    c.days.add(e.date);
    countryMap.set(e.countryId, c);
  }

  return {
    totalUsd,
    days: allDays.size,
    perDayUsd: allDays.size ? totalUsd / allDays.size : 0,
    byCategory: [...catMap].map(([category, usd]) => ({ category, usd })).sort((a, b) => b.usd - a.usd),
    byCountry: [...countryMap]
      .map(([countryId, { usd, days }]) => ({
        countryId,
        usd,
        days: days.size,
        plannedPerDayUsd: getCountry(countryId)?.dailyBudget[styleIndex] ?? null,
      }))
      .sort((a, b) => b.usd - a.usd),
  };
}

/** Keys of everything the app stores locally – used for backup / restore. */
export const backupKeys = ['trip-plan', 'checklist', 'checklist-region', 'journal', 'phrasebook', 'converter'];

export function exportBackup(): string {
  const data: Record<string, unknown> = {};
  for (const key of backupKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) data[key] = JSON.parse(raw);
    } catch {
      // Skip unreadable keys.
    }
  }
  return JSON.stringify({ app: 'trips-app', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
}

/** Validates and restores a backup. Returns false if the file isn't a backup of this app. */
export function importBackup(json: string): boolean {
  let parsed: { app?: string; data?: Record<string, unknown> };
  try {
    parsed = JSON.parse(json);
  } catch {
    return false;
  }
  if (parsed?.app !== 'trips-app' || typeof parsed.data !== 'object' || parsed.data === null) return false;
  for (const key of backupKeys) {
    if (key in parsed.data) localStorage.setItem(key, JSON.stringify(parsed.data[key]));
  }
  return true;
}
