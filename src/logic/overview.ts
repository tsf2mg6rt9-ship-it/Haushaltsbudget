import { summarizeMonth, monthlyCents, isActive } from './calc';
import { addMonths, monthDiff, ymOf } from './dates';
import type { Entry, Recurring, YM } from './types';

export interface OverviewOptions {
  endYM: YM;
  /** Anzahl Monate rückwärts ab endYM oder 'all' */
  months: number | 'all';
  includeUmbau: boolean;
  /** Buchungen mit einem dieser Tags werden herausgerechnet (z. B. "Einmalig") */
  excludeTags?: string[];
}

export interface CategoryRow {
  category: string;
  total: number;
  avg: number;
  fixedTotal: number;
  variableTotal: number;
}

export interface FixedRow {
  id: string;
  label: string;
  category: string;
  type: 'expense' | 'income';
  /** Betrag pro Monat (Quartal/Jahr umgerechnet) */
  monthly: number;
  activeMonths: number;
}

export interface Overview {
  empty: boolean;
  startYM: YM;
  endYM: YM;
  /** Anzahl betrachteter Monate */
  n: number;
  income: { total: number; avg: number };
  fixedExpense: { total: number; avg: number };
  variableExpense: { total: number; avg: number };
  expense: { total: number; avg: number };
  /** Einnahmen minus Ausgaben, Ø pro Monat */
  netAvg: number;
  umbauTotal: number;
  byCategory: CategoryRow[];
  fixedItems: FixedRow[];
  perPerson: { income: [number, number]; expenseShare: [number, number]; netAvg: [number, number] };
}

/** Letzter abgeschlossener Monat – oder der laufende, wenn es noch keine älteren Buchungen gibt. */
export function defaultEndYM(entries: Entry[], nowYM: YM): YM {
  const last = addMonths(nowYM, -1);
  const hasOlder = entries.some((e) => ymOf(e.date) <= last);
  return hasOlder || entries.length === 0 ? last : nowYM;
}

const avg = (total: number, n: number) => (n > 0 ? Math.round(total / n) : 0);

export function buildOverview(allEntries: Entry[], recurring: Recurring[], opts: OverviewOptions): Overview {
  const { endYM, includeUmbau } = opts;
  const ex = (opts.excludeTags ?? []).map((t) => t.toLowerCase());
  const entries = ex.length ? allEntries.filter((e) => !(e.tags ?? []).some((t) => ex.includes(t.toLowerCase()))) : allEntries;
  const firstEntry = entries.length ? entries.map((e) => ymOf(e.date)).sort()[0] : null;
  let start = opts.months === 'all' ? firstEntry ?? endYM : addMonths(endYM, -(opts.months - 1));
  if (firstEntry && monthDiff(start, firstEntry) > 0) start = firstEntry;
  const n = Math.max(0, monthDiff(start, endYM) + 1);

  const empty: Overview = {
    empty: true, startYM: start, endYM, n: 0,
    income: { total: 0, avg: 0 }, fixedExpense: { total: 0, avg: 0 }, variableExpense: { total: 0, avg: 0 }, expense: { total: 0, avg: 0 },
    netAvg: 0, umbauTotal: 0, byCategory: [], fixedItems: [],
    perPerson: { income: [0, 0], expenseShare: [0, 0], netAvg: [0, 0] },
  };
  if (n === 0) return empty;

  let income = 0, fixedExp = 0, varExp = 0, umbauTotal = 0;
  const incP: [number, number] = [0, 0];
  const expP: [number, number] = [0, 0];
  const cat = new Map<string, { fixed: number; variable: number }>();
  for (let i = 0; i < n; i++) {
    const ym = addMonths(start, i);
    const s = summarizeMonth(ym, entries, recurring, { includeUmbau });
    income += s.totalIncome;
    incP[0] += s.income[0]; incP[1] += s.income[1];
    expP[0] += s.expenseShare[0]; expP[1] += s.expenseShare[1];
    for (const l of s.lines) {
      if (l.type !== 'expense') continue;
      const c = cat.get(l.category) ?? { fixed: 0, variable: 0 };
      if (l.source === 'recurring') { c.fixed += l.amountCents; fixedExp += l.amountCents; } else { c.variable += l.amountCents; varExp += l.amountCents; }
      cat.set(l.category, c);
    }
  }
  // Umbau separat ausweisen (auch wenn er aus der Auswertung ausgeschlossen ist)
  for (let i = 0; i < n; i++) {
    const ym = addMonths(start, i);
    umbauTotal += entries.filter((e) => e.umbau && e.type === 'expense' && ymOf(e.date) === ym).reduce((a, e) => a + e.amountCents, 0);
  }

  const fixedItems: FixedRow[] = [];
  for (const r of recurring) {
    let active = 0;
    for (let i = 0; i < n; i++) if (isActive(r, addMonths(start, i))) active++;
    if (active > 0) fixedItems.push({ id: r.id, label: r.label, category: r.category, type: r.type, monthly: monthlyCents(r), activeMonths: active });
  }
  fixedItems.sort((a, b) => b.monthly * b.activeMonths - a.monthly * a.activeMonths);

  const expTotal = fixedExp + varExp;
  return {
    empty: false, startYM: start, endYM, n,
    income: { total: income, avg: avg(income, n) },
    fixedExpense: { total: fixedExp, avg: avg(fixedExp, n) },
    variableExpense: { total: varExp, avg: avg(varExp, n) },
    expense: { total: expTotal, avg: avg(expTotal, n) },
    netAvg: avg(income - expTotal, n),
    umbauTotal,
    byCategory: [...cat.entries()]
      .map(([category, v]) => ({ category, total: v.fixed + v.variable, avg: avg(v.fixed + v.variable, n), fixedTotal: v.fixed, variableTotal: v.variable }))
      .sort((a, b) => b.total - a.total),
    fixedItems,
    perPerson: {
      income: [avg(incP[0], n), avg(incP[1], n)],
      expenseShare: [avg(expP[0], n), avg(expP[1], n)],
      netAvg: [avg(incP[0] - expP[0], n), avg(incP[1] - expP[1], n)],
    },
  };
}
