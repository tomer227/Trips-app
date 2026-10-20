import { describe, expect, it } from 'vitest';
import { buildTripBook } from './tripBook';
import type { Expense, JournalEntry } from './journal';

const entry = (id: string, date: string, countryId: string): JournalEntry => ({ id, date, countryId, title: id, text: '', mood: '😊' });
const expense = (date: string, countryId: string, amountUsd: number): Expense => ({ id: date + countryId, date, countryId, category: 'food', amount: amountUsd, currency: 'USD', amountUsd, note: '' });

describe('buildTripBook', () => {
  it('orders memories oldest first and opens a chapter on each country change', () => {
    const book = buildTripBook({
      entries: [entry('c', '2027-02-10', 'laos'), entry('a', '2027-01-01', 'thailand'), entry('b', '2027-01-20', 'thailand'), entry('d', '2027-03-01', 'thailand')],
      expenses: [expense('2027-01-05', 'thailand', 10), expense('2027-03-02', 'thailand', 5), expense('2027-02-11', 'laos', 7), expense('2027-02-11', 'peru', 100)],
    });
    expect(book.chapters.map((c) => [c.countryId, c.from, c.to, c.entries.map((e) => e.id).join('')])).toEqual([
      ['thailand', '2027-01-01', '2027-01-20', 'ab'],
      ['laos', '2027-02-10', '2027-02-10', 'c'],
      ['thailand', '2027-03-01', '2027-03-01', 'd'],
    ]);
    expect(book.chapters.map((c) => c.spentUsd)).toEqual([10, 7, 5]);
    expect(book).toMatchObject({ from: '2027-01-01', to: '2027-03-01', days: 60, countries: 2, entries: 4, spentUsd: 122 });
  });

  it('is empty without memories', () => {
    expect(buildTripBook({ entries: [], expenses: [] })).toMatchObject({ chapters: [], days: 0, entries: 0 });
  });
});
