import { describe, expect, it } from 'vitest';
import { applyStart, cumulativeSettlement, summarizeMonth } from '../src/logic/calc';
import { buildOverview } from '../src/logic/overview';
import { DEFAULT_SETTINGS, makeBackup, parseBackup } from '../src/logic/backup';
import type { Entry, Recurring } from '../src/logic/types';

let n = 0;
const e = (o: Partial<Entry>): Entry => ({ id: `e${++n}`, date: '2020-12-10', description: 'x', category: 'Sonstiges', amountCents: 10000, type: 'expense', share1Pct: 50, paidBy: 0, ...o });
const miete: Recurring = { id: 'm', label: 'Miete', category: 'Wohnen', type: 'expense', amountCents: 70000, rhythm: 'monthly', share1Pct: 50, paidBy: 0 };
const alt = e({ date: '2020-09-05', amountCents: 50000 });
const neu = e({ date: '2020-12-05', amountCents: 20000 });

describe('Auswertungsbeginn', () => {
  it('ohne Beginn bleibt alles unverändert', () => {
    const r = applyStart([alt, neu], [miete], null);
    expect(r.entries).toHaveLength(2);
    expect(r.recurring[0].from).toBeUndefined();
  });
  it('Buchungen davor fallen weg, Fixposten starten frühestens im Startmonat, spätere "ab"-Monate bleiben', () => {
    const r = applyStart([alt, neu], [miete, { ...miete, id: 'm2', from: '2021-03' }, { ...miete, id: 'm3', from: '2020-01', to: '2020-08' }], '2020-11');
    expect(r.entries.map((x) => x.id)).toEqual([neu.id]);
    expect(r.recurring.map((x) => x.from)).toEqual(['2020-11', '2021-03', '2020-11']);
  });
  it('Monate vor dem Beginn sind leer (inkl. Fixposten), danach normal', () => {
    const { entries, recurring } = applyStart([alt, neu], [miete], '2020-11');
    expect(summarizeMonth('2020-09', entries, recurring).lines).toHaveLength(0);
    expect(summarizeMonth('2020-10', entries, recurring).totalExpense).toBe(0);
    expect(summarizeMonth('2020-11', entries, recurring).totalExpense).toBe(70000);
    expect(summarizeMonth('2020-12', entries, recurring).totalExpense).toBe(90000);
  });
  it('Ausgleich beginnt bei null: Differenz aus Monaten davor wird nicht weitergerechnet', () => {
    // Ohne Beginn: Sept. 2020 (500 €, P1 zahlt) -> P2 schuldet 250 €, Dez. 200 € -> 100 € = 350 €
    expect(cumulativeSettlement([alt, neu], [], '2020-12')).toEqual({ from: 1, to: 0, amountCents: 35000 });
    const s = applyStart([alt, neu], [], '2020-11');
    expect(cumulativeSettlement(s.entries, s.recurring, '2020-12')).toEqual({ from: 1, to: 0, amountCents: 10000 });
  });
  it('Überblick "Alles" beginnt am Startmonat und mittelt nur darüber', () => {
    const s = applyStart([alt, neu], [miete], '2020-11');
    const o = buildOverview(s.entries, s.recurring, { endYM: '2020-12', months: 'all', includeUmbau: true, startMonth: '2020-11' });
    expect(o.startYM).toBe('2020-11');
    expect(o.n).toBe(2);
    expect(o.fixedExpense.avg).toBe(70000);
    expect(o.variableExpense.total).toBe(20000);
  });
  it('Backup behält den Auswertungsbeginn, ungültiger wird verworfen', () => {
    const ok = parseBackup(JSON.stringify(makeBackup({ ...DEFAULT_SETTINGS, startMonth: '2020-11' }, [], [])));
    expect(ok.ok && ok.data.settings.startMonth).toBe('2020-11');
    const bad = makeBackup(DEFAULT_SETTINGS, [], []);
    (bad.settings as unknown as { startMonth: string }).startMonth = '2020-13';
    expect(parseBackup(JSON.stringify(bad)).ok && (parseBackup(JSON.stringify(bad)) as { data: { settings: { startMonth: unknown } } }).data.settings.startMonth).toBeNull();
  });
});
