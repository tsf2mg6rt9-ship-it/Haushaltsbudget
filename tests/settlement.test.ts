import { describe, expect, it } from 'vitest';
import { cumulativeSettlement, summarizeMonth } from '../src/logic/calc';
import { buildCandidates, detectMappingFromData, parseCSV } from '../src/logic/bankcsv';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, makeBackup, parseBackup } from '../src/logic/backup';
import { addRule, entriesToRecategorize, matchRule, suggestMatchTerm } from '../src/logic/rules';
import { parseQuickEntry } from '../src/logic/quick';
import { buildOverview } from '../src/logic/overview';
import { entriesCSV } from '../src/logic/csv';
import { summarizeEntries, tagOverview } from '../src/logic/tags';
import type { Entry } from '../src/logic/types';

const e = (o: Partial<Entry>): Entry => ({ id: Math.random().toString(36), date: '2026-03-10', description: 'x', category: 'Freizeit', amountCents: 100000, type: 'expense', share1Pct: 50, paidBy: 0, ...o });
const settle = (o: Partial<Entry>) => e({ type: 'settlement', category: 'Ausgleich', description: 'Ausgleich', ...o });

describe('Ausgleichszahlungen', () => {
  it('Urlaub 1.000 € von Person 1 bezahlt, 50/50: Person 2 schuldet 500', () => {
    expect(summarizeMonth('2026-03', [e({})], []).settlement).toEqual({ from: 1, to: 0, amountCents: 50000 });
  });
  it('Überweist Person 2 die 500, ist alles ausgeglichen – und es zählt weder als Einnahme noch Ausgabe', () => {
    const s = summarizeMonth('2026-03', [e({}), settle({ amountCents: 50000, paidBy: 1 })], []);
    expect(s.settlement.amountCents).toBe(0);
    expect(s.totalIncome).toBe(0);
    expect(s.totalExpense).toBe(100000);
    expect(s.byCategory.map((c) => c.category)).toEqual(['Freizeit']);
  });
  it('Teilzahlung verringert den Rest', () => {
    const s = summarizeMonth('2026-03', [e({}), settle({ amountCents: 20000, paidBy: 1 })], []);
    expect(s.settlement).toEqual({ from: 1, to: 0, amountCents: 30000 });
  });
  it('Zu viel überwiesen: Richtung dreht sich', () => {
    const s = summarizeMonth('2026-03', [e({}), settle({ amountCents: 60000, paidBy: 1 })], []);
    expect(s.settlement).toEqual({ from: 0, to: 1, amountCents: 10000 });
  });
  it('Rückzahlung im Folgemonat: Monatsansicht zeigt Minus, Gesamtsaldo stimmt', () => {
    const entries = [e({}), settle({ date: '2026-04-05', amountCents: 50000, paidBy: 1 })];
    expect(summarizeMonth('2026-04', entries, []).settlement).toEqual({ from: 0, to: 1, amountCents: 50000 });
    expect(cumulativeSettlement(entries, [], '2026-03')).toEqual({ from: 1, to: 0, amountCents: 50000 });
    expect(cumulativeSettlement(entries, [], '2026-04').amountCents).toBe(0);
  });
  it('Gesamtsaldo bezieht Fixposten mit ein', () => {
    const rec = [{ id: 'r', label: 'Miete', category: 'Wohnen', type: 'expense' as const, amountCents: 70000, rhythm: 'monthly' as const, share1Pct: 50, paidBy: 0 as const, from: '2026-01' }];
    // 3 Monate à 350 geschuldet, 2 Zahlungen à 350 erhalten
    const entries = [settle({ date: '2026-01-05', amountCents: 35000, paidBy: 1 }), settle({ date: '2026-02-05', amountCents: 35000, paidBy: 1 })];
    expect(cumulativeSettlement(entries, rec, '2026-03')).toEqual({ from: 1, to: 0, amountCents: 35000 });
  });
  it('Tags/CSV/Backup behandeln Ausgleich korrekt', () => {
    const s = settle({ tags: ['Urlaub'], amountCents: 5000 });
    expect(tagOverview([s])[0]).toMatchObject({ expenseCents: 0, incomeCents: 0 });
    expect(summarizeEntries([s]).incomeCents).toBe(0);
    expect(entriesCSV([s], DEFAULT_SETTINGS)).toContain('Ausgleich');
    const r = parseBackup(JSON.stringify(makeBackup(DEFAULT_SETTINGS, [{ ...s, id: 'z' }], [])));
    expect(r.ok && r.data.entries[0].type).toBe('settlement');
  });
});

describe('Händler-Regeln', () => {
  const rules = [{ match: 'Hotel Hirschen', category: 'Restaurant' }, { match: 'Hotel', category: 'Freizeit' }];
  it('längste passende Regel gewinnt, ohne Groß-/Kleinschreibung', () => {
    expect(matchRule('hotel hirschen schwarzenberg – rechnung', rules)).toBe('Restaurant');
    expect(matchRule('hotel sonne', rules)).toBe('Freizeit');
    expect(matchRule('billa', rules)).toBe('');
  });
  it('Suchbegriff-Vorschlag', () => {
    expect(suggestMatchTerm('Hotel Hirschen Schwarzenberg 6867 – POS 123')).toBe('Hotel Hirschen Schwarzenberg');
    expect(suggestMatchTerm('SENNEREI 2362 D4 06.09. 08:50')).toBe('SENNEREI');
    expect(suggestMatchTerm('BILLA DANKT 1234 – POS')).toBe('BILLA DANKT');
  });
  it('addRule ersetzt gleichen Begriff', () => {
    expect(addRule(rules, 'hotel', 'Restaurant')).toEqual([rules[0], { match: 'hotel', category: 'Restaurant' }]);
    expect(addRule(rules, '  ', 'X')).toBe(rules);
  });
  it('bestehende Buchungen umkategorisieren (nicht Umbau/Ausgleich)', () => {
    const list = [e({ description: 'Hotel Hirschen', category: 'Freizeit' }), e({ description: 'Hotel Hirschen', category: 'Restaurant' }),
      e({ description: 'Hotel Hirschen', umbau: { trade: 'x', paid: true } }), settle({ description: 'Hotel Hirschen' })];
    const ch = entriesToRecategorize(list, rules);
    expect(ch).toHaveLength(1);
    expect(ch[0].category).toBe('Restaurant');
  });
  it('Regel schlägt eingebaute Schlagwörter (Hotel -> Freizeit) in Schnelleingabe', () => {
    const base = { today: '2026-10-12', names: ['Ich', 'Freund'] as [string, string], categories: DEFAULT_CATEGORIES };
    expect(parseQuickEntry('Hotel Hirschen 80 Euro', base).category).toBe('Freizeit');
    expect(parseQuickEntry('Hotel Hirschen 80 Euro', { ...base, rules }).category).toBe('Restaurant');
  });
});

describe('Import: Regeln und Partner-Zahlungen', () => {
  const csv = [
    '10.03.2026,"Payment recipient: Hotel Hirschen Schwarzenberg Purpose of use: Essen",10.03.2026,-85.50,EUR,x',
    '11.03.2026,"Client: Ghezzi Andrea Purpose of use: Urlaub",11.03.2026,300,EUR,x',
    '12.03.2026,"Payment recipient: Ghezzi Andrea Purpose of use: Anteil",12.03.2026,-20,EUR,x',
    '13.03.2026,"Purpose of use: REVOLUT**1234* DUBLIN",13.03.2026,-50,EUR,x',
  ].join('\n');
  const rows = parseCSV(csv);
  const map = detectMappingFromData(rows);
  const base = { existing: [], recurring: [], categories: DEFAULT_CATEGORIES };
  it('Regel hat Vorrang vor Schlagwort', () => {
    const { candidates } = buildCandidates(rows, -1, map, { ...base, rules: [{ match: 'Hotel Hirschen', category: 'Restaurant' }] });
    expect(candidates[0].category).toBe('Restaurant');
    expect(buildCandidates(rows, -1, map, base).candidates[0].category).toBe('Freizeit');
  });
  it('Zahlungen vom/an Partner: als Ausgleich markiert und vorausgewählt', () => {
    const { candidates } = buildCandidates(rows, -1, map, { ...base, ignoreTerms: ['Ghezzi'] });
    expect(candidates[1]).toMatchObject({ partner: true, selected: true, type: 'income', category: 'Ausgleich' });
    expect(candidates[2]).toMatchObject({ partner: true, selected: true, type: 'expense' });
    expect(candidates[0].partner).toBe(false);
    expect(candidates[3]).toMatchObject({ transfer: true, selected: false });
  });
  it('erneuter Import erkennt vorhandene Ausgleichszahlungen als Duplikat', () => {
    const existing = [settle({ date: '2026-03-11', amountCents: 30000, paidBy: 1 })]; // Partner (1) hat an Konto-Inhaber (0) überwiesen
    const { candidates } = buildCandidates(rows, -1, map, { ...base, ignoreTerms: ['Ghezzi'], existing, owner: 0 });
    expect(candidates[1].duplicate).toBe(true);
    expect(candidates[1].selected).toBe(false);
  });
});

describe('Überblick: Ausnahmen-Tags', () => {
  const entries = [e({ date: '2026-01-05', amountCents: 10000 }), e({ date: '2026-02-05', amountCents: 10000 }), e({ date: '2026-02-06', amountCents: 90000, tags: ['Einmalig'] })];
  it('rechnet Buchungen mit Ausnahme-Tag heraus (ohne Beachtung der Schreibweise)', () => {
    const o = buildOverview(entries, [], { endYM: '2026-02', months: 'all', includeUmbau: true, excludeTags: ['einmalig'] });
    expect(o.variableExpense.total).toBe(20000);
    expect(buildOverview(entries, [], { endYM: '2026-02', months: 'all', includeUmbau: true }).variableExpense.total).toBe(110000);
  });
});
