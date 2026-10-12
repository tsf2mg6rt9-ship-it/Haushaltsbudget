import { splitCents } from './money';
import type { Entry } from './types';

const MAX_TAGS = 12;
const MAX_LEN = 40;

/** Tags bereinigen: "#" entfernen, Leerzeichen glätten, ohne Beachtung der Groß-/Kleinschreibung doppelte entfernen. */
export function normalizeTags(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const t = raw.replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** "Urlaub, Frankreich; Geburtstag" -> ["Urlaub", "Frankreich", "Geburtstag"] */
export function parseTagInput(text: string): string[] {
  return normalizeTags(text.split(/[,;\n]/));
}

export const hasTag = (e: Entry, tag: string): boolean => (e.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase());

export interface TagInfo {
  tag: string;
  count: number;
  expenseCents: number;
  incomeCents: number;
}

/** Alle verwendeten Tags mit Anzahl und Summen (Anzeige-Schreibweise = häufigste Variante). */
export function tagOverview(entries: Entry[]): TagInfo[] {
  const map = new Map<string, TagInfo & { forms: Map<string, number> }>();
  for (const e of entries) {
    for (const t of e.tags ?? []) {
      const key = t.toLowerCase();
      const cur = map.get(key) ?? { tag: t, count: 0, expenseCents: 0, incomeCents: 0, forms: new Map() };
      cur.count++;
      if (e.type === 'expense') cur.expenseCents += e.amountCents;
      else if (e.type === 'income') cur.incomeCents += e.amountCents;
      cur.forms.set(t, (cur.forms.get(t) ?? 0) + 1);
      map.set(key, cur);
    }
  }
  return [...map.values()]
    .map(({ forms, ...info }) => ({ ...info, tag: [...forms.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.expenseCents - a.expenseCents || a.tag.localeCompare(b.tag, 'de'));
}

/** Einträge, die ALLE gewählten Tags tragen. */
export function filterByTags(entries: Entry[], selected: string[]): Entry[] {
  if (selected.length === 0) return entries;
  return entries.filter((e) => selected.every((t) => hasTag(e, t)));
}

export interface TagSummary {
  count: number;
  expenseCents: number;
  incomeCents: number;
  /** Anteil beider Personen an den Ausgaben */
  share: [number, number];
  firstDate: string | null;
  lastDate: string | null;
  byCategory: { category: string; cents: number }[];
}

export function summarizeEntries(entries: Entry[]): TagSummary {
  let expense = 0;
  let income = 0;
  const share: [number, number] = [0, 0];
  const cat = new Map<string, number>();
  for (const e of entries) {
    if (e.type === 'expense') {
      expense += e.amountCents;
      const [a, b] = splitCents(e.amountCents, e.share1Pct);
      share[0] += a;
      share[1] += b;
      cat.set(e.category, (cat.get(e.category) ?? 0) + e.amountCents);
    } else if (e.type === 'income') income += e.amountCents;
  }
  const dates = entries.map((e) => e.date).sort();
  return {
    count: entries.length, expenseCents: expense, incomeCents: income, share,
    firstDate: dates[0] ?? null, lastDate: dates[dates.length - 1] ?? null,
    byCategory: [...cat.entries()].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents),
  };
}

/** Tag umbenennen (leer = entfernen, existiert der neue Name schon = zusammenführen). Gibt nur geänderte Einträge zurück. */
export function renameTag(entries: Entry[], from: string, to: string): Entry[] {
  const changed: Entry[] = [];
  for (const e of entries) {
    if (!hasTag(e, from)) continue;
    const next = normalizeTags((e.tags ?? []).map((t) => (t.toLowerCase() === from.toLowerCase() ? to : t)));
    changed.push({ ...e, tags: next.length ? next : undefined });
  }
  return changed;
}
