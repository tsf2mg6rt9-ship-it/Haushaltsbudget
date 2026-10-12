import { describe, expect, it } from 'vitest';
import { buildOverview, defaultEndYM } from '../src/logic/overview';
import { filterByTags, normalizeTags, parseTagInput, renameTag, summarizeEntries, tagOverview } from '../src/logic/tags';
import { parseBackup, makeBackup, DEFAULT_SETTINGS } from '../src/logic/backup';
import type { Entry, Recurring } from '../src/logic/types';

const entry = (o: Partial<Entry>): Entry => ({ id: Math.random().toString(36), date: '2026-03-10', description: 'x', category: 'Lebensmittel', amountCents: 10000, type: 'expense', share1Pct: 50, paidBy: 0, ...o });
const rec = (o: Partial<Recurring>): Recurring => ({ id: Math.random().toString(36), label: 'Miete', category: 'Wohnen', type: 'expense', amountCents: 80000, rhythm: 'monthly', share1Pct: 50, paidBy: 0, ...o });

describe('Auswertung', () => {
  const entries = [
    entry({ date: '2026-01-05', amountCents: 20000 }), entry({ date: '2026-02-05', amountCents: 40000 }),
    entry({ date: '2026-02-10', amountCents: 10000, category: 'Restaurant' }), entry({ date: '2026-03-01', amountCents: 30000 }),
  ];
  const recs = [rec({}), rec({ type: 'income', label: 'Gehalt', amountCents: 250000, category: 'Gehalt', paidBy: 0 })];
  it('Durchschnitt pro Monat über abgeschlossene Monate, Fix vs. variabel', () => {
    const o = buildOverview(entries, recs, { endYM: '2026-03', months: 'all', includeUmbau: true });
    expect(o.n).toBe(3);
    expect(o.fixedExpense.avg).toBe(80000);
    expect(o.variableExpense.total).toBe(100000);
    expect(o.variableExpense.avg).toBe(33333);
    expect(o.income.avg).toBe(250000);
    expect(o.netAvg).toBe(Math.round((750000 - 240000 - 100000) / 3));
    const food = o.byCategory.find((c) => c.category === 'Lebensmittel')!;
    expect(food).toMatchObject({ total: 90000, avg: 30000, variableTotal: 90000, fixedTotal: 0 });
  });
  it('begrenzt auf die letzten N Monate', () => {
    const o = buildOverview(entries, recs, { endYM: '2026-03', months: 2, includeUmbau: true });
    expect(o.n).toBe(2);
    expect(o.startYM).toBe('2026-02');
    expect(o.variableExpense.total).toBe(80000);
  });
  it('Zeitraum beginnt nicht vor der ersten Buchung (kein Verwässern mit leeren Monaten)', () => {
    const o = buildOverview(entries, recs, { endYM: '2026-03', months: 12, includeUmbau: true });
    expect(o.startYM).toBe('2026-01');
    expect(o.n).toBe(3);
  });
  it('Umbau wird getrennt ausgewiesen und lässt sich ausschließen', () => {
    const e = [...entries, entry({ date: '2026-03-15', amountCents: 500000, category: 'Umbau', umbau: { trade: 'X', paid: true } })];
    const without = buildOverview(e, recs, { endYM: '2026-03', months: 'all', includeUmbau: false });
    expect(without.umbauTotal).toBe(500000);
    expect(without.variableExpense.total).toBe(100000);
    const withIt = buildOverview(e, recs, { endYM: '2026-03', months: 'all', includeUmbau: true });
    expect(withIt.variableExpense.total).toBe(600000);
  });
  it('Fixposten nur in aktiven Monaten', () => {
    const o = buildOverview(entries, [rec({ from: '2026-02' })], { endYM: '2026-03', months: 'all', includeUmbau: true });
    expect(o.fixedItems[0].activeMonths).toBe(2);
    expect(o.fixedExpense.total).toBe(160000);
    expect(o.fixedExpense.avg).toBe(53333);
  });
  it('leer, wenn nichts im Zeitraum', () => {
    expect(buildOverview(entries, recs, { endYM: '2025-12', months: 3, includeUmbau: true }).empty).toBe(true);
  });
  it('Standard-Endmonat: letzter abgeschlossener, sonst laufender', () => {
    expect(defaultEndYM(entries, '2026-04')).toBe('2026-03');
    expect(defaultEndYM([entry({ date: '2026-04-02' })], '2026-04')).toBe('2026-04');
  });
  it('Personenanteile', () => {
    const o = buildOverview([entry({ date: '2026-03-01', share1Pct: 100, amountCents: 10000 })], [], { endYM: '2026-03', months: 'all', includeUmbau: true });
    expect(o.perPerson.expenseShare).toEqual([10000, 0]);
  });
});

describe('Tags', () => {
  it('normalisieren', () => {
    expect(normalizeTags(['#Urlaub', ' urlaub ', 'Frankreich  Reise', ''])).toEqual(['Urlaub', 'Frankreich Reise']);
    expect(parseTagInput('Urlaub, Frankreich; Geburtstag')).toEqual(['Urlaub', 'Frankreich', 'Geburtstag']);
  });
  const es = [
    entry({ tags: ['Urlaub', 'Frankreich'], amountCents: 5000 }), entry({ tags: ['urlaub'], amountCents: 2000, share1Pct: 100 }),
    entry({ tags: ['Geburtstag'], amountCents: 3000 }), entry({ amountCents: 9999 }),
    entry({ tags: ['Urlaub'], type: 'income', amountCents: 1000 }),
  ];
  it('Übersicht pro Tag, Groß-/Kleinschreibung zusammengeführt', () => {
    const t = tagOverview(es);
    const u = t.find((x) => x.tag.toLowerCase() === 'urlaub')!;
    expect(u).toMatchObject({ count: 3, expenseCents: 7000, incomeCents: 1000 });
    expect(t).toHaveLength(3);
  });
  it('Filter: alle gewählten Tags müssen passen', () => {
    expect(filterByTags(es, ['Urlaub'])).toHaveLength(3);
    expect(filterByTags(es, ['Urlaub', 'Frankreich'])).toHaveLength(1);
    expect(filterByTags(es, [])).toHaveLength(5);
  });
  it('Zusammenfassung mit Anteilen', () => {
    const s = summarizeEntries(filterByTags(es, ['Urlaub']).filter((e) => e.type === 'expense'));
    expect(s.expenseCents).toBe(7000);
    expect(s.share).toEqual([2500 + 2000, 2500]);
  });
  it('Umbenennen, Zusammenführen, Entfernen', () => {
    expect(renameTag(es, 'Frankreich', 'Südfrankreich')[0].tags).toEqual(['Urlaub', 'Südfrankreich']);
    expect(renameTag([entry({ tags: ['A', 'B'] })], 'A', 'B')[0].tags).toEqual(['B']);
    expect(renameTag([entry({ tags: ['A'] })], 'A', '')[0].tags).toBeUndefined();
  });
  it('Backup-Roundtrip behält Tags und aktive Tags', () => {
    const b = makeBackup({ ...DEFAULT_SETTINGS, activeTags: ['Urlaub'] }, [entry({ id: 'a', tags: ['Urlaub', 'Frankreich'] })], []);
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok && r.data.entries[0].tags).toEqual(['Urlaub', 'Frankreich']);
    expect(r.ok && r.data.settings.activeTags).toEqual(['Urlaub']);
  });
});

describe('Überblick nach Person', () => {
  const es = [entry({ date: '2026-03-05', amountCents: 10000, share1Pct: 70 }), entry({ date: '2026-03-06', amountCents: 5000, share1Pct: 0, category: 'Restaurant', paidBy: 1 })];
  const recs = [rec({}), rec({ type: 'income', label: 'Gehalt A', amountCents: 250000, paidBy: 0 }), rec({ type: 'income', label: 'Gehalt B', amountCents: 300000, paidBy: 1 })];
  const o = (person: 0 | 1 | null) => buildOverview(es, recs, { endYM: '2026-03', months: 'all', includeUmbau: true, person });
  it('Person 1: eigene Einnahmen und Ausgabenanteile', () => {
    const a = o(0);
    expect(a.income.total).toBe(250000);
    expect(a.fixedExpense.total).toBe(40000);
    expect(a.variableExpense.total).toBe(7000);
    expect(a.byCategory.find((c) => c.category === 'Restaurant')).toBeUndefined();
    expect(a.fixedItems.map((f) => f.label).sort()).toEqual(['Gehalt A', 'Miete']);
    expect(a.fixedItems.find((f) => f.label === 'Miete')!.monthly).toBe(40000);
  });
  it('Person 2: Rest der Anteile', () => {
    const b = o(1);
    expect(b.income.total).toBe(300000);
    expect(b.variableExpense.total).toBe(3000 + 5000);
    expect(b.byCategory.find((c) => c.category === 'Restaurant')!.total).toBe(5000);
  });
  it('beide Personen ergeben zusammen gemeinsam', () => {
    expect(o(0).expense.total + o(1).expense.total).toBe(o(null).expense.total);
    expect(o(0).income.total + o(1).income.total).toBe(o(null).income.total);
  });
});
