import { describe, expect, it } from 'vitest';
import { monthlyCents, summarizeMonth } from '../src/logic/calc';
import { affordability } from '../src/logic/loan';
import { buildOverview } from '../src/logic/overview';
import { buildCandidates, detectMapping, parseCSV } from '../src/logic/bankcsv';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, makeBackup, parseBackup } from '../src/logic/backup';
import type { Recurring } from '../src/logic/types';

const gehalt = (o: Partial<Recurring> = {}): Recurring => ({ id: 'g', label: 'Gehalt', category: 'Gehalt', type: 'income', amountCents: 240000, rhythm: 'monthly', share1Pct: 50, paidBy: 0, pay14: true, ...o });

describe('14 Gehälter', () => {
  it('monatlicher Durchschnitt = Betrag × 14 / 12', () => {
    expect(monthlyCents(gehalt())).toBe(280000);
    expect(monthlyCents(gehalt({ pay14: undefined }))).toBe(240000);
  });
  it('über ein Jahr ergeben 12 Monate genau 14 Gehälter', () => {
    let sum = 0;
    for (let m = 1; m <= 12; m++) sum += summarizeMonth(`2026-${String(m).padStart(2, '0')}`, [], [gehalt()]).totalIncome;
    expect(sum).toBe(240000 * 14);
  });
  it('Überblick und Kreditrechner nutzen den Durchschnitt; "vorsichtig" nur 12 Gehälter', () => {
    const o = buildOverview([], [gehalt()], { endYM: '2026-03', months: 1, includeUmbau: true });
    expect(o.income.avg).toBe(280000);
    expect(affordability('2026-03', [gehalt()], 0, 0).income).toBe(280000);
    expect(affordability('2026-03', [{ ...gehalt(), pay14: undefined }], 0, 0).income).toBe(240000);
  });
  it('Import: Gehaltszeilen (normal und doppelt im Juli/Dezember) werden als Fixposten erkannt', () => {
    const rows = parseCSV('Buchungsdatum;Partnername;Verwendungszweck;Betrag\n01.06.2026;Arbeitgeber GmbH;Lohn/Gehalt 06/2026;2.400,00\n01.07.2026;Arbeitgeber GmbH;Lohn/Gehalt 07/2026 inkl. Urlaubsgeld;4.800,00');
    const { candidates } = buildCandidates(rows, 0, detectMapping(rows[0]), { existing: [], recurring: [gehalt()], categories: DEFAULT_CATEGORIES, owner: 0 });
    expect(candidates.map((c) => [c.fixMatch, c.selected])).toEqual([[true, false], [true, false]]);
  });
  it('Backup: Flag nur bei monatlicher Einnahme, noSpecialPay bleibt erhalten', () => {
    const ok = parseBackup(JSON.stringify(makeBackup({ ...DEFAULT_SETTINGS, loan: { ...DEFAULT_SETTINGS.loan, noSpecialPay: true } }, [], [gehalt(), gehalt({ id: 'x', type: 'expense' })])));
    expect(ok.ok && ok.data.recurring[0].pay14).toBe(true);
    expect(ok.ok && ok.data.recurring[1].pay14).toBeUndefined();
    expect(ok.ok && ok.data.settings.loan.noSpecialPay).toBe(true);
  });
});
