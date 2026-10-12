import { isActive } from './calc';
import { matchFix } from './fixmatch';
import { ymOf } from './dates';
import { TRANSFER_RE } from './bankcsv';
import type { Entry, Recurring } from './types';

export type FlagKind = 'gehalt' | 'fix' | 'dublette' | 'partner' | 'umbuchung';
export interface Flag {
  kind: FlagKind;
  text: string;
}

/**
 * Sucht in bestehenden Buchungen nach Verdächtigem (Doppelungen mit Fixposten, Dubletten, Zahlungen vom Partner,
 * Umbuchungen). Vom Nutzer bestätigte Buchungen (`checked`) werden nicht mehr gemeldet.
 */
export function findFlags(entries: Entry[], recurring: Recurring[], partnerTerms: string[] = []): Map<string, Flag[]> {
  const out = new Map<string, Flag[]>();
  const add = (id: string, f: Flag) => out.set(id, [...(out.get(id) ?? []), f]);
  const terms = partnerTerms.map((t) => t.trim().toLowerCase()).filter(Boolean);
  const seen = new Map<string, string>();

  for (const e of [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1))) {
    if (e.checked) continue;
    const low = e.description.toLowerCase();
    const ym = ymOf(e.date);

    if (e.type !== 'settlement' && terms.some((t) => low.includes(t))) {
      add(e.id, { kind: 'partner', text: 'Zahlung vom/an deinen Partner – als Ausgleich erfassen?' });
      continue;
    }
    if (e.type !== 'settlement' && TRANSFER_RE.test(e.description)) {
      add(e.id, { kind: 'umbuchung', text: 'Sieht nach einer Umbuchung auf ein eigenes Konto aus – doppelt gezählt?' });
    }
    if (!e.umbau && e.type === 'income' && (e.category === 'Gehalt' || /gehalt|lohn/i.test(e.description))
      && recurring.some((f) => f.type === 'income' && f.category === 'Gehalt' && f.paidBy === e.paidBy && isActive(f, ym))) {
      add(e.id, { kind: 'gehalt', text: 'Gehalt zusätzlich zum festen Gehalt – doppelt gezählt?' });
    } else if (!e.umbau && e.type !== 'settlement') {
      const f = matchFix(recurring, { type: e.type, ym, amountCents: e.amountCents, text: low, category: e.category, owner: e.paidBy, strictAmount: true });
      if (f) add(e.id, { kind: 'fix', text: `Sieht aus wie dein Fixposten „${f.label}“ – doppelt gezählt?` });
    }
    // Dubletten: gleiche Buchung (Datum, Typ, Betrag, Beschreibung) mehrfach
    const key = `${e.date}|${e.type}|${e.amountCents}|${low.trim()}`;
    if (seen.has(key)) add(e.id, { kind: 'dublette', text: 'Mögliche Dublette (gleiches Datum, gleicher Betrag, gleiche Beschreibung).' });
    else seen.set(key, e.id);
  }
  return out;
}
