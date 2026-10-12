import { DEFAULT_SETTINGS } from './logic/backup';
import { addDays, toISO } from './logic/dates';
import type { Entry, Recurring, Settings } from './logic/types';
import { getState, replaceAll } from './store';

/** Demo-Build (nur erfundene Daten, kein Service Worker) */
export const IS_DEMO = import.meta.env.VITE_DEMO === '1';

const e = (id: string, daysAgo: number, description: string, category: string, euro: number, o: Partial<Entry> = {}): Entry => ({
  id: `demo-e-${id}`, date: toISO(addDays(new Date(), -daysAgo)), description, category, amountCents: Math.round(euro * 100),
  type: 'expense', share1Pct: 50, paidBy: 0, ...o,
});

function demoEntries(): Entry[] {
  const out: Entry[] = [];
  const shop: [string, string, number, number, 0 | 1][] = [
    ['Billa', 'Lebensmittel', 54.2, 50, 0], ['Hofer', 'Lebensmittel', 38.9, 50, 1], ['Pizzeria Roma', 'Restaurant', 46.5, 50, 0],
    ['OMV Tanken', 'Mobilität', 62.4, 100, 0], ['Apotheke', 'Gesundheit', 14.8, 0, 1], ['Kino', 'Freizeit', 24, 50, 1],
    ['Spar', 'Lebensmittel', 71.3, 50, 0], ['dm', 'Haushalt', 27.6, 50, 1],
  ];
  for (let m = 0; m < 4; m++) {
    shop.forEach(([d, c, amt, share, by], i) => {
      out.push(e(`${m}-${i}`, m * 30 + i * 3 + 1, d, c, amt + ((m * 7 + i * 3) % 9), { share1Pct: share, paidBy: by }));
    });
  }
  const umbau = (id: string, daysAgo: number, trade: string, euro: number, paid: boolean, o: Partial<Entry> = {}) =>
    e(`u-${id}`, daysAgo, '', 'Umbau', euro, { umbau: { trade, paid, invoiceNo: `R-${id}` }, ...o });
  out.push(umbau('1', 40, 'Architekt', 3200, true), umbau('2', 12, 'Statiker', 1450, true, { paidBy: 1 }),
    umbau('3', -30, 'Elektriker', 5800, false), umbau('4', -75, 'Fliesenleger', 7400, false, { paidBy: 1 }), umbau('5', -120, 'Maler', 4300, false));
  return out;
}

const r = (id: string, label: string, category: string, type: 'expense' | 'income', euro: number, o: Partial<Recurring> = {}): Recurring => ({
  id: `demo-r-${id}`, label, category, type, amountCents: Math.round(euro * 100), rhythm: 'monthly', share1Pct: 50, paidBy: 0, ...o,
});

const demoRecurring = (): Recurring[] => [
  r('1', 'Gehalt Anna', 'Gehalt', 'income', 2350, { paidBy: 0 }),
  r('2', 'Gehalt Ben', 'Gehalt', 'income', 2700, { paidBy: 1 }),
  r('3', 'Miete', 'Wohnen', 'expense', 780),
  r('4', 'Internet', 'Abos', 'expense', 35, { paidBy: 1 }),
  r('5', 'Haushaltsversicherung', 'Versicherung', 'expense', 120, { rhythm: 'quarterly' }),
  r('6', 'Strom & Wasser (neue Wohnung)', 'Wohnen', 'expense', 160, { from: toISO(addDays(new Date(), 90)).slice(0, 7) }),
];

const demoSettings = (): Settings => ({
  ...DEFAULT_SETTINGS, names: ['Anna', 'Ben'], umbauBudgetCents: 6_000_000, startBalanceCents: 800_000,
  lastBackupAt: new Date().toISOString(), installHintDismissed: true,
});

export const hasNoData = () => {
  const s = getState();
  return s.entries.length === 0 && s.recurring.length === 0;
};

/** Füllt die App mit erfundenen Beispieldaten (nur wenn noch nichts erfasst wurde). */
export async function loadDemo() {
  if (!hasNoData()) return;
  await replaceAll(demoSettings(), demoEntries(), demoRecurring());
}
