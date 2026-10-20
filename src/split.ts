import type { Expense } from './journal';

/** "Me" in paidBy / split; partners are stored by the names the traveller typed. */
export const ME = 'me';

export const participants = (e: Expense): string[] => (e.split && e.split.length > 0 ? e.split : [ME]);

/** What this expense cost me: the whole amount, or my part of a shared one. */
export function myShareUsd(e: Expense): number {
  const people = participants(e);
  if (!people.includes(ME)) return 0;
  return e.amountUsd / people.length;
}

/** Net balance per person in USD: positive = others owe them, negative = they owe. */
export function balances(expenses: Expense[]): Map<string, number> {
  const net = new Map<string, number>();
  const add = (who: string, usd: number) => net.set(who, (net.get(who) ?? 0) + usd);
  for (const e of expenses) {
    const people = participants(e);
    if (people.length === 1 && people[0] === (e.paidBy ?? ME)) continue; // a personal expense
    add(e.paidBy ?? ME, e.amountUsd);
    for (const p of people) add(p, -e.amountUsd / people.length);
  }
  return net;
}

export interface Transfer {
  from: string;
  to: string;
  usd: number;
}

/** The fewest simple transfers that settle everyone (greedy: biggest debtor pays biggest creditor). */
export function settle(expenses: Expense[]): Transfer[] {
  const people = [...balances(expenses)].map(([who, usd]) => ({ who, usd: Math.round(usd * 100) / 100 }));
  const debtors = people.filter((p) => p.usd < -0.009).sort((a, b) => a.usd - b.usd);
  const creditors = people.filter((p) => p.usd > 0.009).sort((a, b) => b.usd - a.usd);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(-debtors[i].usd, creditors[j].usd);
    out.push({ from: debtors[i].who, to: creditors[j].who, usd: Math.round(pay * 100) / 100 });
    debtors[i].usd += pay;
    creditors[j].usd -= pay;
    if (debtors[i].usd > -0.009) i++;
    if (creditors[j].usd < 0.009) j++;
  }
  return out;
}

/** Partner names: trimmed, 1-20 characters, no duplicates, never the reserved "me". */
export function cleanPartnerName(name: string, existing: string[]): string | null {
  const n = name.trim().slice(0, 20);
  if (!n || n === ME || existing.includes(n)) return null;
  return n;
}
