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
  };
}

/**
 * Ausgleich: Person A hat `paid[A]` vorgestreckt, trägt aber nur `expenseShare[A]`.
 * Differenz = was die andere Person überweisen muss. Einnahmen fließen NICHT ein.
 */
export function computeSettlement(paid: [number, number], expenseShare: [number, number]): Settlement {
  const balance1 = paid[0] - expenseShare[0]; // >0: Person 2 schuldet Person 1
  if (balance1 > 0) return { from: 1, to: 0, amountCents: balance1 };
  if (balance1 < 0) return { from: 0, to: 1, amountCents: -balance1 };
  return { from: null, to: null, amountCents: 0 };
}

export function summarizeLines(ym: YM, lines: Line[]): MonthSummary {
  const income: [number, number] = [0, 0];
  const expenseShare: [number, number] = [0, 0];
  const paid: [number, number] = [0, 0];
  const cat = new Map<string, number>();
  for (const l of lines) {
    if (l.type === 'income') {
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
    totalExpense: expenseShare[0] + expenseShare[1],
    totalIncome: income[0] + income[1],
    net: [income[0] - expenseShare[0], income[1] - expenseShare[1]],
    settlement: computeSettlement(paid, expenseShare),
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

export { addMonths };
