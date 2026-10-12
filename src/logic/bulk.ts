import { ymOf } from './dates';
import { hasTag, normalizeTags } from './tags';
import type { Entry, EntryType, PersonIdx, YM } from './types';

export interface EntryFilter {
  q: string;
  category: string;
  type: 'all' | EntryType;
  /** nur Ausgaben: 50/50, nur Person 1 (100 %), nur Person 2 (0 %), andere Verhältnisse */
  share: 'all' | 'half' | 'p1' | 'p2' | 'other';
  payer: 'all' | '0' | '1';
  source: 'all' | 'import' | 'manual';
  batch: string;
  tag: string;
  from: YM | '';
  to: YM | '';
}

export const EMPTY_FILTER: EntryFilter = { q: '', category: '', type: 'all', share: 'all', payer: 'all', source: 'all', batch: '', tag: '', from: '', to: '' };

export const isImported = (e: Entry): boolean => !!e.importId || e.note === 'Import Kontoauszug';

export function filterEntries(entries: Entry[], f: EntryFilter): Entry[] {
  const q = f.q.trim().toLowerCase();
  return entries
    .filter((e) => {
      if (q && !`${e.description} ${e.category} ${e.note ?? ''} ${e.umbau?.trade ?? ''} ${(e.tags ?? []).join(' ')}`.toLowerCase().includes(q)) return false;
      if (f.category && e.category !== f.category) return false;
      if (f.type !== 'all' && e.type !== f.type) return false;
      if (f.share !== 'all') {
        if (e.type !== 'expense') return false;
        const kind = e.share1Pct === 50 ? 'half' : e.share1Pct === 100 ? 'p1' : e.share1Pct === 0 ? 'p2' : 'other';
        if (kind !== f.share) return false;
      }
      if (f.payer !== 'all' && e.type !== 'settlement' && String(e.paidBy) !== f.payer) return false;
      if (f.payer !== 'all' && e.type === 'settlement') return false;
      if (f.source === 'import' && !isImported(e)) return false;
      if (f.source === 'manual' && isImported(e)) return false;
      if (f.batch && e.importId !== f.batch) return false;
      if (f.tag && !hasTag(e, f.tag)) return false;
      const ym = ymOf(e.date);
      if (f.from && ym < f.from) return false;
      if (f.to && ym > f.to) return false;
      return true;
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));
}

export interface ImportBatch {
  id: string;
  count: number;
  firstDate: string;
  lastDate: string;
}

export function importBatches(entries: Entry[]): ImportBatch[] {
  const map = new Map<string, ImportBatch>();
  for (const e of entries) {
    if (!e.importId) continue;
    const b = map.get(e.importId) ?? { id: e.importId, count: 0, firstDate: e.date, lastDate: e.date };
    b.count++;
    if (e.date < b.firstDate) b.firstDate = e.date;
    if (e.date > b.lastDate) b.lastDate = e.date;
    map.set(e.importId, b);
  }
  return [...map.values()].sort((a, b) => (a.id < b.id ? 1 : -1));
}

export interface BulkPatch {
  share1Pct?: number;
  paidBy?: PersonIdx;
  category?: string;
  addTags?: string[];
  removeTags?: string[];
}

/**
 * Mehrere Buchungen gleichzeitig ändern. Aufteilung gilt nur für Ausgaben, "bezahlt von" und Kategorie nur für
 * Ausgaben und Einnahmen (bei Ausgleichszahlungen würde es die Richtung bzw. den Zweck verfälschen), Tags für alle.
 * Gibt nur tatsächlich geänderte Buchungen zurück.
 */
export function applyBulk(entries: Entry[], patch: BulkPatch): Entry[] {
  const out: Entry[] = [];
  for (const e of entries) {
    const next: Entry = { ...e };
    if (patch.share1Pct !== undefined && e.type === 'expense') next.share1Pct = Math.min(100, Math.max(0, patch.share1Pct));
    if (patch.paidBy !== undefined && e.type !== 'settlement') next.paidBy = patch.paidBy;
    if (patch.category && e.type !== 'settlement') next.category = patch.category;
    if (patch.addTags?.length || patch.removeTags?.length) {
      const rm = (patch.removeTags ?? []).map((t) => t.toLowerCase());
      const tags = normalizeTags([...(e.tags ?? []).filter((t) => !rm.includes(t.toLowerCase())), ...(patch.addTags ?? [])]);
      if (tags.length) next.tags = tags; else delete next.tags;
    }
    if (JSON.stringify(next) !== JSON.stringify(e)) out.push(next);
  }
  return out;
}
