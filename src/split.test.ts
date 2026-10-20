import { describe, expect, it } from 'vitest';
import type { Expense } from './journal';
import { ME, balances, cleanPartnerName, myShareUsd, settle } from './split';

const exp = (amountUsd: number, paidBy?: string, split?: string[]): Expense => ({
  id: String(Math.random()),
  date: '2027-01-01',
  countryId: 'peru',
  category: 'food',
  amount: amountUsd,
  currency: 'USD',
  amountUsd,
  note: '',
  paidBy,
  split,
});

describe('split', () => {
  it('counts only my part of a shared expense', () => {
    expect(myShareUsd(exp(30))).toBe(30);
    expect(myShareUsd(exp(30, ME, [ME, 'דנה', 'יוסי']))).toBe(10);
    expect(myShareUsd(exp(30, ME, ['דנה']))).toBe(0); // I paid for Dana
  });

  it('works out who owes whom with the fewest transfers', () => {
    const expenses = [exp(90, ME, [ME, 'דנה', 'יוסי']), exp(30, 'דנה', [ME, 'דנה', 'יוסי']), exp(12)];
    expect(Object.fromEntries(balances(expenses))).toEqual({ me: 50, 'דנה': -10, 'יוסי': -40 });
    expect(settle(expenses)).toEqual([
      { from: 'יוסי', to: ME, usd: 40 },
      { from: 'דנה', to: ME, usd: 10 },
    ]);
    expect(settle([exp(12)])).toEqual([]);
  });

  it('cleans partner names', () => {
    expect(cleanPartnerName('  דנה ', [])).toBe('דנה');
    expect(cleanPartnerName('דנה', ['דנה'])).toBeNull();
    expect(cleanPartnerName('   ', [])).toBeNull();
    expect(cleanPartnerName(ME, [])).toBeNull();
  });
});
