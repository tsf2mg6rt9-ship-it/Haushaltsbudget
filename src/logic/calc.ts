import { addMonths, monthDiff, ymOf } from './dates';
import { splitCents } from './money';
import type { Entry, Line, MonthSummary, Recurring, Rhythm, Settlement, YM } from './types';

const DIVISOR: Record<Rhythm, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** Monatlicher Anteil einer Fixposition (Quartal/Jahr werden auf Monate umgelegt). */
export function monthlyCents(r: Pick<Recurring, 'amountCents' | 'rhythm'>): number {
  return Math.round(r.amountCents / DIVISOR[r.rhythm]);
}

export function isActive(r: Pick<Recurring, 'from' | 'to'>, ym: YM): boolean {
  if (r.from && monthDiff(r.from, ym) < 0) return false;
  if (r.to && monthDiff(ym, r.to) < 0) return false;
  return true;
}

export function recurringLines(recurring: Recurring[], ym: YM): Line[] {
  return recurring
    .filter((r) => isActive(r, ym))
    .map((r) => ({
      key: `r:${r.id}`,
      source: 'recurring' as const,
      id: r.id,
      date: null,
      description: r.label,
      category: r.category,
      type: r.type,
      amountCents: monthlyCents(r),
      share1Pct: r.share1Pct,
      paidBy: r.paidBy,
    }));
}

export function entryLine(e: Entry): Line {
  return {
    key: `e:${e.id}`,
    source: 'entry',
    id: e.id,
    date: e.date,
    description: e.description,
    category: e.category,
    type: e.type,
    amountCents: e.amountCents,
    share1Pct: e.share1Pct,
    paidBy: e.paidBy,
    umbau: e.umbau,
    tags: e.tags,
  };
}

/**
 * Ausgleich: Person A hat `paid[A]` vorgestreckt, trägt aber nur `expenseShare[A]`.
 * Differenz = was die andere Person überweisen muss. Einnahmen fließen NICHT ein.
 */
export function computeSettlement(paid: [number, number], expenseShare: [number, number], sent: [number, number] = [0, 0]): Settlement {
  // >0: Person 2 schuldet Person 1. Bereits überwiesene Ausgleichszahlungen verringern die Schuld.
  const balance1 = paid[0] - expenseShare[0] - sent[1] + sent[0];
  if (balance1 > 0) return { from: 1, to: 0, amountCents: balance1 };
  if (balance1 < 0) return { from: 0, to: 1, amountCents: -balance1 };
  return { from: null, to: null, amountCents: 0 };
}

export function summarizeLines(ym: YM, lines: Line[]): MonthSummary {
  const income: [number, number] = [0, 0];
  const expenseShare: [number, number] = [0, 0];
  const paid: [number, number] = [0, 0];
  const settled: [number, number] = [0, 0];
  const cat = new Map<string, number>();
  for (const l of lines) {
    if (l.type === 'settlement') {
      settled[l.paidBy] += l.amountCents;
    } else if (l.type === 'income') {
      income[l.paidBy] += l.amountCents;
    } else {
      const [s1, s2] = splitCents(l.amountCents, l.share1Pct);
      expenseShare[0] += s1;
      expenseShare[1] += s2;
      paid[l.paidBy] += l.amountCents;
      cat.set(l.category, (cat.get(l.category) ?? 0) + l.amountCents);
    }
  }
  return {
    ym,
    lines,
    income,
    expenseShare,
    paid,
    settled,
    totalExpense: expenseShare[0] + expenseShare[1],
    totalIncome: income[0] + income[1],
    net: [income[0] - expenseShare[0], income[1] - expenseShare[1]],
    settlement: computeSettlement(paid, expenseShare, settled),
    byCategory: [...cat.entries()].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents),
  };
}

export interface MonthOptions {
  includeUmbau?: boolean;
}

export function summarizeMonth(ym: YM, entries: Entry[], recurring: Recurring[], opts: MonthOptions = {}): MonthSummary {
  const includeUmbau = opts.includeUmbau ?? true;
  const entryLines = entries
    .filter((e) => ymOf(e.date) === ym && (includeUmbau || !e.umbau))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map(entryLine);
  return summarizeLines(ym, [...recurringLines(recurring, ym), ...entryLines]);
}

/**
 * Offener Ausgleich über alle Monate bis einschließlich `upToYM` (Ausgleichszahlungen aus späteren Monaten
 * sind dabei noch nicht verrechnet). Nützlich, wenn z. B. ein Urlaub erst im Folgemonat zurückgezahlt wird.
 */
export function cumulativeSettlement(entries: Entry[], recurring: Recurring[], upToYM: YM): Settlement {
  const months = [
    ...entries.filter((e) => ymOf(e.date) <= upToYM).map((e) => ymOf(e.date)),
    ...recurring.filter((r) => r.from && r.from <= upToYM).map((r) => r.from as YM),
  ].sort();
  const start = months[0] ?? upToYM;
  let balance1 = 0;
  for (let ym = start; monthDiff(ym, upToYM) >= 0; ym = addMonths(ym, 1)) {
    const s = summarizeMonth(ym, entries, recurring);
    balance1 += s.paid[0] - s.expenseShare[0] - s.settled[1] + s.settled[0];
  }
  return balance1 > 0 ? { from: 1, to: 0, amountCents: balance1 } : balance1 < 0 ? { from: 0, to: 1, amountCents: -balance1 } : { from: null, to: null, amountCents: 0 };
}

export { addMonths };
