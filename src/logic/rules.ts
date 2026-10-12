import type { CategoryRule, Entry } from './types';

/** Kategorie der längsten passenden Regel, '' wenn keine passt. `lower` muss klein geschrieben sein. */
export function matchRule(lower: string, rules: CategoryRule[] | undefined): string {
  let best: CategoryRule | undefined;
  for (const r of rules ?? []) {
    const m = r.match.trim().toLowerCase();
    if (m && lower.includes(m) && (!best || m.length > best.match.trim().length)) best = r;
  }
  return best?.category ?? '';
}

/** Vorschlag für den Suchbegriff einer Regel: Name des Händlers vor technischen Zahlen/Codes (max. 3 Wörter). */
export function suggestMatchTerm(description: string): string {
  const head = description.split(' – ')[0].trim();
  const out: string[] = [];
  for (const w of head.split(/\s+/).filter(Boolean)) {
    if (/\d/.test(w) || /^(pos|sepa|d4|epayment)$/i.test(w)) break;
    out.push(w);
    if (out.length >= 3) break;
  }
  const term = out.join(' ').trim();
  return term.length >= 3 ? term : head.slice(0, 30);
}

/** Regel hinzufügen; gleicher Suchbegriff (ohne Groß-/Kleinschreibung) wird ersetzt. */
export function addRule(rules: CategoryRule[], match: string, category: string): CategoryRule[] {
  const m = match.trim();
  if (!m) return rules;
  return [...rules.filter((r) => r.match.trim().toLowerCase() !== m.toLowerCase()), { match: m, category }];
}

/** Bestehende Buchungen, deren Kategorie nach den Regeln anders lauten müsste (Umbau und Ausgleich bleiben unberührt). */
export function entriesToRecategorize(entries: Entry[], rules: CategoryRule[]): Entry[] {
  const out: Entry[] = [];
  for (const e of entries) {
    if (e.umbau || e.type === 'settlement') continue;
    const cat = matchRule(e.description.toLowerCase(), rules);
    if (cat && cat !== e.category) out.push({ ...e, category: cat });
  }
  return out;
}
