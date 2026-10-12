import { addMonths } from './dates';
import { summarizeMonth } from './calc';
import type { Entry, Recurring, YM } from './types';

export interface PlanRow {
  ym: YM;
  income: number;
  fixed: number;
  variable: number;
  variableIsEstimate: boolean;
  umbau: number;
  net: number;
  cumulative: number;
}

/** Durchschnitt der variablen (nicht-Umbau) Ausgaben der letzten `months` abgeschlossenen Monate (ab dem ersten Eintrag). */
export function averageVariable(entries: Entry[], currentYM: YM, months = 3): number {
  const variable = entries.filter((e) => e.type === 'expense' && !e.umbau);
  if (variable.length === 0) return 0;
  const first = variable.reduce((m, e) => (e.date < m ? e.date : m), variable[0].date).slice(0, 7);
  let sum = 0;
  let counted = 0;
  for (let i = 1; i <= months; i++) {
    const ym = addMonths(currentYM, -i);
    if (ym < first) break;
    sum += variable.filter((e) => e.date.startsWith(ym)).reduce((s, e) => s + e.amountCents, 0);
    counted++;
  }
  return counted === 0 ? 0 : Math.round(sum / counted);
}

/**
 * Vorschau: feste Einnahmen/Ausgaben (berechnet), geschätzte variable Ausgaben,
 * bereits eingetragene Umbau-Rechnungen (auch zukünftige). Startbestand = Stand zu Beginn von `fromYM`.
 */
export function buildPlan(
  entries: Entry[],
  recurring: Recurring[],
  fromYM: YM,
  count: number,
  startBalanceCents: number,
  variableEstimateCents: number,
): PlanRow[] {
  const rows: PlanRow[] = [];
  let cumulative = startBalanceCents;
  for (let i = 0; i < count; i++) {
    const ym = addMonths(fromYM, i);
    const fixedOnly = summarizeMonth(ym, [], recurring);
    const monthEntries = entries.filter((e) => e.date.startsWith(ym));
    const umbau = monthEntries.filter((e) => e.umbau && e.type === 'expense').reduce((s, e) => s + e.amountCents, 0);
    const bookedVariable = monthEntries.filter((e) => !e.umbau && e.type === 'expense').reduce((s, e) => s + e.amountCents, 0);
    const bookedIncome = monthEntries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amountCents, 0);
    const income = fixedOnly.totalIncome + bookedIncome;
    const fixed = fixedOnly.totalExpense;
    const isFuture = i > 0;
    // Für zukünftige Monate: mindestens die Schätzung; wurde schon mehr gebucht, zählt das Gebuchte.
    const variable = isFuture ? Math.max(bookedVariable, variableEstimateCents) : bookedVariable;
    const net = income - fixed - variable - umbau;
    cumulative += net;
    rows.push({ ym, income, fixed, variable, variableIsEstimate: isFuture && variable === variableEstimateCents && variable > bookedVariable, umbau, net, cumulative });
  }
  return rows;
}
