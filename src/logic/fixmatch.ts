import { isActive, monthlyCents } from './calc';
import type { EntryType, Recurring, YM } from './types';

/** Fällt in diesem Monat die Abbuchung eines jährlichen/quartalsweisen Fixpostens an? (false, wenn kein Abbuchungsmonat gesetzt ist) */
export function isDueInMonth(r: Pick<Recurring, 'rhythm' | 'dueMonth'>, ym: YM): boolean {
  if (r.rhythm === 'monthly' || !r.dueMonth) return false;
  const month = +ym.slice(5, 7);
  return r.rhythm === 'yearly' ? month === r.dueMonth : (((month - r.dueMonth) % 3) + 3) % 3 === 0;
}

export interface FixQuery {
  type: EntryType;
  ym: YM;
  amountCents: number;
  /** Beschreibung in Kleinbuchstaben */
  text: string;
  category?: string;
  /** Kontoinhaber bzw. Empfänger: bei Einnahmen muss das Fix-Gehalt/die feste Einnahme zu dieser Person gehören */
  owner?: 0 | 1;
  /** true: gleicher Betrag allein reicht nicht, zusätzlich muss Kategorie oder Bezeichnung passen */
  strictAmount?: boolean;
}

/**
 * Welcher aktive Fixposten steckt (vermutlich) hinter einer Buchung?
 *  1. Bezeichnung des Fixpostens steht im Text (ab 6 Zeichen, z. B. „Reiseversicherung“)
 *  2. gleicher Betrag (monatlich oder je Zahlung)
 *  3. jährlicher/quartalsweiser Posten im Abbuchungsmonat mit ähnlichem Betrag (±20 %, z. B. nach einer Preiserhöhung)
 */
export function matchFix(recurring: Recurring[], q: FixQuery): Recurring | undefined {
  return recurring.find((f) => {
    if (f.type !== q.type || !isActive(f, q.ym)) return false;
    if (f.type === 'income' && q.owner !== undefined && f.paidBy !== q.owner) return false;
    const label = f.label.trim().toLowerCase();
    const labelHit = label.length >= 6 && q.text.includes(label);
    if (labelHit) return true;
    const amountHit = monthlyCents(f) === q.amountCents || f.amountCents === q.amountCents;
    if (amountHit && (!q.strictAmount || f.category === q.category || (label !== '' && q.text.includes(label)))) return true;
    if (isDueInMonth(f, q.ym) && Math.abs(q.amountCents - f.amountCents) <= f.amountCents * 0.2) return true;
    return false;
  });
}
