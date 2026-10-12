import { describe, expect, it } from 'vitest';
import { applyBulk, EMPTY_FILTER, filterEntries, importBatches, isImported } from '../src/logic/bulk';
import { DEFAULT_SETTINGS, makeBackup, parseBackup } from '../src/logic/backup';
import type { Entry } from '../src/logic/types';

let n = 0;
const e = (o: Partial<Entry>): Entry => ({ id: `e${++n}`, date: '2026-03-10', description: 'x', category: 'Sonstiges', amountCents: 1000, type: 'expense', share1Pct: 50, paidBy: 0, ...o });

describe('Filter', () => {
  const imp1 = '2026-10-12T19:00:00.000Z', imp2 = '2026-10-13T08:00:00.000Z';
  const list = [
    e({ description: 'Billa', category: 'Lebensmittel', importId: imp1, note: 'Import Kontoauszug', share1Pct: 50 }),
    e({ description: 'Tanken', category: 'Mobilität', importId: imp1, note: 'Import Kontoauszug', share1Pct: 100, date: '2026-04-01' }),
    e({ description: 'Hofer', category: 'Lebensmittel', importId: imp2, note: 'Import Kontoauszug', share1Pct: 50, date: '2026-05-01' }),
    e({ description: 'Eis', share1Pct: 70 }),
    e({ description: 'Gehalt', type: 'income', category: 'Gehalt', amountCents: 200000 }),
    e({ type: 'settlement', description: 'Ausgleich', paidBy: 1 }),
    e({ description: 'Alt-Import', note: 'Import Kontoauszug' }),
  ];
  it('ohne Filter alles, neueste zuerst', () => {
    const r = filterEntries(list, EMPTY_FILTER);
    expect(r).toHaveLength(7);
    expect(r[0].date >= r[r.length - 1].date).toBe(true);
  });
  it('Kombination: importiert + 50/50 + bezahlt von Person 1 (der typische Korrekturfall)', () => {
    const r = filterEntries(list, { ...EMPTY_FILTER, source: 'import', share: 'half', payer: '0' });
    expect(r.map((x) => x.description).sort()).toEqual(['Alt-Import', 'Billa', 'Hofer']);
  });
  it('Import-Lauf, Aufteilung "andere", Art, Suche, Monate', () => {
    expect(filterEntries(list, { ...EMPTY_FILTER, batch: imp1 })).toHaveLength(2);
    expect(filterEntries(list, { ...EMPTY_FILTER, share: 'other' }).map((x) => x.description)).toEqual(['Eis']);
    expect(filterEntries(list, { ...EMPTY_FILTER, type: 'income' })).toHaveLength(1);
    expect(filterEntries(list, { ...EMPTY_FILTER, q: 'HOF' })).toHaveLength(1);
    expect(filterEntries(list, { ...EMPTY_FILTER, from: '2026-04', to: '2026-04' }).map((x) => x.description)).toEqual(['Tanken']);
    expect(filterEntries(list, { ...EMPTY_FILTER, source: 'manual' }).every((x) => !isImported(x))).toBe(true);
  });
  it('Import-Läufe gezählt, neuester zuerst', () => {
    const b = importBatches(list);
    expect(b.map((x) => [x.id, x.count])).toEqual([[imp2, 1], [imp1, 2]]);
    expect(b[1]).toMatchObject({ firstDate: '2026-03-10', lastDate: '2026-04-01' });
  });
});

describe('Sammeländerung', () => {
  const exp = e({ share1Pct: 50, paidBy: 0, category: 'Sonstiges' });
  const inc = e({ type: 'income', paidBy: 1, category: 'Sonstige Einnahmen' });
  const set = e({ type: 'settlement', paidBy: 1, category: 'Ausgleich', share1Pct: 50 });
  it('Aufteilung nur bei Ausgaben', () => {
    const r = applyBulk([exp, inc, set], { share1Pct: 100 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: exp.id, share1Pct: 100 });
  });
  it('Zahler und Kategorie nie bei Ausgleich', () => {
    const r = applyBulk([exp, inc, set], { paidBy: 1, category: 'Haushalt' });
    expect(r.map((x) => x.id).sort()).toEqual([exp.id, inc.id].sort());
    expect(r.find((x) => x.id === exp.id)).toMatchObject({ paidBy: 1, category: 'Haushalt' });
    expect(r.find((x) => x.id === inc.id)).toMatchObject({ paidBy: 1, category: 'Haushalt' });
  });
  it('gibt nur tatsächlich geänderte zurück', () => {
    expect(applyBulk([exp], { share1Pct: 50, paidBy: 0 })).toEqual([]);
    expect(applyBulk([exp], {})).toEqual([]);
  });
  it('Tags hinzufügen und entfernen', () => {
    const a = e({ tags: ['Urlaub', 'Alt'] });
    const r = applyBulk([a, set], { addTags: ['Frankreich', 'urlaub'], removeTags: ['alt'] });
    expect(r.find((x) => x.id === a.id)!.tags).toEqual(['Urlaub', 'Frankreich']);
    expect(applyBulk([e({ tags: ['A'] })], { removeTags: ['A'] })[0].tags).toBeUndefined();
  });
  it('Prozent wird begrenzt, Original bleibt unverändert', () => {
    const r = applyBulk([exp], { share1Pct: 150 });
    expect(r[0].share1Pct).toBe(100);
    expect(exp.share1Pct).toBe(50);
  });
});

describe('Backup', () => {
  it('importId bleibt erhalten', () => {
    const r = parseBackup(JSON.stringify(makeBackup(DEFAULT_SETTINGS, [e({ id: 'z', importId: 'abc' })], [])));
    expect(r.ok && r.data.entries[0].importId).toBe('abc');
  });
});
