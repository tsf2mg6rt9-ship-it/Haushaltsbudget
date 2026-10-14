import { ymOf } from './dates';
import { suggestMatchTerm } from './rules';
import { monthDiff } from './dates';
import type { Entry, Rhythm, YM } from './types';

export interface FixSuggestion {
  /** Vorschlag für die Bezeichnung (und zugleich der Suchbegriff für gleiche Buchungen) */
  label: string;
  /** Erster Monat, in dem eine gleiche Buchung vorkommt */
  from: YM;
  rhythm: Rhythm;
  /** Abbuchungsmonat (1–12) bei jährlich/quartalsweise */
  dueMonth?: number;
  /** Alle Buchungen (inkl. der angetippten), die zu diesem Fixposten gehören dürften */
  matches: Entry[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Aus einer Buchung einen Fixposten ableiten: gleiche Buchungen (gleicher Name und Art) werden gesucht,
 * aus den Abständen der Monate ergibt sich der Rhythmus (monatlich, alle 3 Monate, jährlich).
 * `pool` = vorhandene Buchungen (ggf. zusätzlich Zeilen eines noch nicht importierten Kontoauszugs).
 */
export function suggestFix(pool: Entry[], entry: Entry): FixSuggestion {
  const label = suggestMatchTerm(entry.description) || entry.description.trim().slice(0, 40) || entry.category;
  const low = label.toLowerCase();
  const matches = pool.filter((e) => e.id === entry.id || (!e.umbau && e.type !== 'settlement' && e.type === entry.type && low.length >= 3 && e.description.toLowerCase().includes(low)));
  if (!matches.some((e) => e.id === entry.id)) matches.push(entry);
  const months = [...new Set(matches.map((e) => ymOf(e.date)))].sort();
  let rhythm: Rhythm = 'monthly';
  if (months.length >= 2) {
    const gaps = months.slice(1).map((m, i) => monthDiff(months[i], m));
    const med = median(gaps);
    rhythm = med >= 10 ? 'yearly' : med >= 2 ? 'quarterly' : 'monthly';
  }
  const due = rhythm === 'monthly' ? undefined : +ymOf(entry.date).slice(5, 7);
  return { label, from: months[0], rhythm, dueMonth: due, matches };
}
