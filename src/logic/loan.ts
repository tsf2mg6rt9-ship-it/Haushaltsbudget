import { addMonths } from './dates';
import { recurringLines, summarizeMonth } from './calc';
import { splitCents } from './money';
import type { PersonIdx, Recurring, YM } from './types';

/** Monatliche Annuitätenrate (Cent) für Kreditsumme, Sollzins p. a. (%) und Laufzeit in Monaten. */
export function annuityPayment(principalCents: number, annualRatePct: number, months: number): number {
  if (months <= 0 || principalCents <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.round(principalCents / months);
  return Math.round((principalCents * r) / (1 - Math.pow(1 + r, -months)));
}

/** Maximale Kreditsumme (Cent), die sich mit einer monatlichen Rate finanzieren lässt. */
export function principalFromPayment(paymentCents: number, annualRatePct: number, months: number): number {
  if (months <= 0 || paymentCents <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return paymentCents * months;
  return Math.round((paymentCents * (1 - Math.pow(1 + r, -months))) / r);
}

export interface Affordability {
  ym: YM;
  income: number;
  fixed: number;
  variable: number;
  buffer: number;
  /** Was monatlich für eine Kreditrate übrig bleibt (nie negativ) */
  free: number;
  /** Rohwert, kann negativ sein */
  freeRaw: number;
}

/** person = null: beide gemeinsam. Sonst trägt nur diese Person die Rate (Einkommen und Kosten nur von ihr). */
export interface Scenario {
  person: PersonIdx | null;
  /** Nur bei person != null: Fixkosten voll (z. B. Wohnung allein) statt nur dem bisherigen Anteil */
  fullFixed: boolean;
}
const TOGETHER: Scenario = { person: null, fullFixed: false };

/** Freier Betrag im Monat `ym` aus Fixposten (inkl. ab/bis), geschätzten variablen Ausgaben und Puffer. */
export function affordability(ym: YM, recurring: Recurring[], variableCents: number, bufferPct: number, sc: Scenario = TOGETHER): Affordability {
  let income: number;
  let fixed: number;
  if (sc.person === null) {
    const m = summarizeMonth(ym, [], recurring);
    income = m.totalIncome;
    fixed = m.totalExpense;
  } else {
    const lines = recurringLines(recurring, ym);
    income = lines.filter((l) => l.type === 'income' && l.paidBy === sc.person).reduce((s, l) => s + l.amountCents, 0);
    fixed = lines.filter((l) => l.type === 'expense').reduce((s, l) => s + (sc.fullFixed ? l.amountCents : splitCents(l.amountCents, l.share1Pct)[sc.person!]), 0);
  }
  const buffer = Math.round((income * bufferPct) / 100);
  const freeRaw = income - fixed - variableCents - buffer;
  return { ym, income, fixed, variable: variableCents, buffer, freeRaw, free: Math.max(0, freeRaw) };
}

/** Der ungünstigste Monat in den nächsten `count` Monaten (ab `fromYM`) – wichtig, wenn sich Fixkosten ändern. */
export function worstMonth(fromYM: YM, count: number, recurring: Recurring[], variableCents: number, bufferPct: number, sc: Scenario = TOGETHER): Affordability {
  let worst = affordability(fromYM, recurring, variableCents, bufferPct, sc);
  for (let i = 1; i < count; i++) {
    const a = affordability(addMonths(fromYM, i), recurring, variableCents, bufferPct, sc);
    if (a.freeRaw < worst.freeRaw) worst = a;
  }
  return worst;
}
