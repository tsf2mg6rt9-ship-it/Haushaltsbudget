import { toISO } from './logic/dates';
import type { Entry, Recurring, Settings } from './logic/types';
import { uid } from './store';

export const todayISO = () => toISO(new Date());

export function newEntry(settings: Settings, patch: Partial<Entry> = {}): Entry {
  return {
    id: uid(), date: todayISO(), description: '', category: settings.categories.includes('Lebensmittel') ? 'Lebensmittel' : settings.categories[0] ?? 'Sonstiges',
    amountCents: 0, type: 'expense', share1Pct: 50, paidBy: 0, ...patch,
  };
}

export function newUmbauEntry(settings: Settings): Entry {
  return newEntry(settings, { category: 'Umbau', umbau: { trade: '', paid: true } });
}

export function newRecurring(type: 'expense' | 'income' = 'expense'): Recurring {
  return {
    id: uid(), label: '', category: type === 'income' ? 'Gehalt' : 'Wohnen', type, amountCents: 0,
    rhythm: 'monthly', share1Pct: 50, paidBy: 0,
  };
}

/** Händler -> Kategorie aus früheren Buchungen (neueste zuerst), für die Schnelleingabe. */
export function learnedCategories(entries: Entry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of [...entries].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    const key = e.description.trim().toLowerCase();
    if (key && key.length >= 3 && !(key in out) && e.category !== 'Sonstiges' && !e.umbau) out[key] = e.category;
  }
  return out;
}
