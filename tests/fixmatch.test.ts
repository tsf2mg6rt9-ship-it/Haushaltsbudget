import { describe, expect, it } from 'vitest';
import { isDueInMonth, matchFix } from '../src/logic/fixmatch';
import { buildCandidates, detectMapping, parseCSV } from '../src/logic/bankcsv';
import { findFlags } from '../src/logic/review';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, makeBackup, parseBackup } from '../src/logic/backup';
import type { Entry, Recurring } from '../src/logic/types';

const reise: Recurring = { id: 'r1', label: 'Reiseversicherung', category: 'Versicherung', type: 'expense', amountCents: 48000, rhythm: 'yearly', dueMonth: 6, share1Pct: 50, paidBy: 0 };

describe('Abbuchungsmonat', () => {
  it('jährlich: nur im Abbuchungsmonat', () => {
    expect(isDueInMonth(reise, '2026-06')).toBe(true);
    expect(isDueInMonth(reise, '2026-07')).toBe(false);
    expect(isDueInMonth({ rhythm: 'yearly' }, '2026-06')).toBe(false);
  });
  it('quartalsweise: alle drei Monate ab dem ersten Abbuchungsmonat', () => {
    const q = { rhythm: 'quarterly' as const, dueMonth: 2 };
    expect(['2026-02', '2026-05', '2026-08', '2026-11'].every((m) => isDueInMonth(q, m))).toBe(true);
    expect(['2026-01', '2026-03', '2026-04'].some((m) => isDueInMonth(q, m))).toBe(false);
  });
  it('monatlich: nie "fällig"', () => expect(isDueInMonth({ rhythm: 'monthly', dueMonth: 3 }, '2026-03')).toBe(false));
});

describe('Fixposten erkennen', () => {
  const q = (o: object) => ({ type: 'expense' as const, ym: '2026-06', amountCents: 48000, text: 'x', ...o });
  it('Bezeichnung im Text, auch bei anderem Betrag und in anderem Monat', () => {
    expect(matchFix([reise], q({ amountCents: 51234, ym: '2026-09', text: 'europäische reiseversicherung ag – polizze 123' }))?.id).toBe('r1');
  });
  it('Abbuchungsmonat mit ähnlichem Betrag (±20 %), aber nicht außerhalb des Monats oder weit daneben', () => {
    expect(matchFix([reise], q({ amountCents: 53000 }))?.id).toBe('r1');
    expect(matchFix([reise], q({ amountCents: 53000, ym: '2026-07' }))).toBeUndefined();
    expect(matchFix([reise], q({ amountCents: 90000 }))).toBeUndefined();
  });
  it('gleicher Betrag; im strengen Modus nur mit passender Kategorie', () => {
    expect(matchFix([{ ...reise, dueMonth: undefined }], q({ ym: '2026-09' }))?.id).toBe('r1');
    expect(matchFix([{ ...reise, dueMonth: undefined }], q({ ym: '2026-09', strictAmount: true, category: 'Freizeit' }))).toBeUndefined();
    expect(matchFix([{ ...reise, dueMonth: undefined }], q({ ym: '2026-09', strictAmount: true, category: 'Versicherung' }))?.id).toBe('r1');
  });
  it('Gehalt-Fix der anderen Person trifft Einnahmen nicht', () => {
    const g: Recurring = { ...reise, id: 'g', label: 'Gehalt', category: 'Gehalt', type: 'income', rhythm: 'monthly', amountCents: 240000, paidBy: 0 };
    expect(matchFix([g], { type: 'income', ym: '2026-03', amountCents: 265000, text: 'lohn/gehalt', owner: 1 })).toBeUndefined();
    expect(matchFix([g], { type: 'income', ym: '2026-03', amountCents: 265000, text: 'lohn/gehalt', owner: 0 })?.id).toBe('g');
  });
});

describe('Import und Prüfung: Reiseversicherung nicht doppelt', () => {
  const rows = parseCSV('Buchungsdatum;Partnername;Verwendungszweck;Betrag\n12.06.2026;Europäische Reiseversicherung AG;Polizze 4711;-512,34\n13.06.2026;Billa;Einkauf;-20,00');
  const map = detectMapping(rows[0]);
  it('Zeile wird als Fixposten erkannt, abgewählt und benennt den Fixposten', () => {
    const { candidates } = buildCandidates(rows, 0, map, { existing: [], recurring: [reise], categories: DEFAULT_CATEGORIES });
    expect(candidates[0]).toMatchObject({ fixMatch: true, fixLabel: 'Reiseversicherung', selected: false });
    expect(candidates[1]).toMatchObject({ fixMatch: false, selected: true });
  });
  it('bereits importierte Buchung wird in der Prüfung rot markiert', () => {
    const e: Entry = { id: 'e1', date: '2026-06-12', description: 'Europäische Reiseversicherung AG – Polizze 4711', category: 'Sonstiges', amountCents: 51234, type: 'expense', share1Pct: 50, paidBy: 0 };
    expect(findFlags([e], [reise]).get('e1')?.[0].kind).toBe('fix');
  });
});

describe('Backup', () => {
  it('Abbuchungsmonat bleibt erhalten, ungültiger wird verworfen', () => {
    const ok = parseBackup(JSON.stringify(makeBackup(DEFAULT_SETTINGS, [], [reise])));
    expect(ok.ok && ok.data.recurring[0].dueMonth).toBe(6);
    const bad = parseBackup(JSON.stringify(makeBackup(DEFAULT_SETTINGS, [], [{ ...reise, dueMonth: 13 }])));
    expect(bad.ok && bad.data.recurring[0].dueMonth).toBeUndefined();
  });
});
