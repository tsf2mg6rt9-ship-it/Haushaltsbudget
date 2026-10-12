import { describe, expect, it } from 'vitest';
import { buildCandidates, detectDelimiter, detectHeaderRow, detectMapping, parseBankAmount, parseBankDate, parseCSV } from '../src/logic/bankcsv';
import { DEFAULT_CATEGORIES } from '../src/logic/backup';
import type { Entry, Recurring } from '../src/logic/types';

describe('Bank-CSV Grundfunktionen', () => {
  it.each([
    ['-54,20', -5420], ['1.234,56', 123456], ['-1.234,56', -123456], ['1,234.56', 123456], ['+12,50', 1250],
    ['12,50-', -1250], ['12,50 EUR', 1250], ['54.20', 5420], ['1.234', 123400], ['(5,00)', -500], ['0,00', 0],
  ])('Betrag %s -> %i', (i, e) => expect(parseBankAmount(i)).toBe(e));
  it('ungültige Beträge', () => { expect(parseBankAmount('abc')).toBeNull(); expect(parseBankAmount('')).toBeNull(); });
  it.each([['03.10.2026', '2026-10-03'], ['3.10.26', '2026-10-03'], ['2026-10-03', '2026-10-03'], ['03/10/2026', '2026-10-03'], ['2026-10-03T12:00:00', '2026-10-03'], ['03.10.2026 14:22', '2026-10-03']])('Datum %s', (i, e) => expect(parseBankDate(i)).toBe(e));
  it('ungültiges Datum', () => { expect(parseBankDate('31.02.2026')).toBeNull(); expect(parseBankDate('xyz')).toBeNull(); });
  it('Trennzeichen', () => {
    expect(detectDelimiter('a;b;c\n1,5;2;3')).toBe(';');
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
  });
  it('CSV mit Anführungszeichen, Zeilenumbruch, BOM', () => {
    const rows = parseCSV('﻿a;b\r\n"x;y";"z ""q"""\r\n"mehr\nzeilig";2\r\n');
    expect(rows).toEqual([['a', 'b'], ['x;y', 'z "q"'], ['mehr\nzeilig', '2']]);
  });
});

describe('Spaltenerkennung', () => {
  it('österreichisches Format', () => {
    const m = detectMapping(['Buchungsdatum', 'Valuta', 'Partnername', 'Verwendungszweck', 'Betrag', 'Währung']);
    expect(m.date).toBe(0); expect(m.amount).toBe(4); expect(m.text).toEqual([2, 3]);
  });
  it('N26-ähnlich (englisch)', () => {
    const m = detectMapping(['Date', 'Payee', 'Account number', 'Transaction type', 'Payment reference', 'Amount (EUR)']);
    expect(m.date).toBe(0); expect(m.amount).toBe(5); expect(m.text).toContain(1); expect(m.text).toContain(4);
  });
  it('Soll/Haben', () => {
    const m = detectMapping(['Datum', 'Text', 'Soll', 'Haben']);
    expect(m.amount).toBeNull(); expect(m.debit).toBe(2); expect(m.credit).toBe(3);
  });
  it('Kopfzeile nach Infozeilen', () => {
    expect(detectHeaderRow([['Konto: AT12'], ['Zeitraum 1-3'], ['Buchungsdatum', 'Betrag', 'Verwendungszweck'], ['01.01.2026', '1', 'x']])).toBe(2);
  });
});

const entry = (o: Partial<Entry>): Entry => ({ id: 'x', date: '2026-03-10', description: '', category: 'Sonstiges', amountCents: 5420, type: 'expense', share1Pct: 50, paidBy: 0, ...o });
const rec: Recurring = { id: 'r', label: 'Miete', category: 'Wohnen', type: 'expense', amountCents: 90000, rhythm: 'monthly', share1Pct: 50, paidBy: 0 };

describe('Kandidaten', () => {
  const csv = [
    'Buchungsdatum;Partnername;Verwendungszweck;Betrag',
    '10.03.2026;BILLA DANKT;POS 1234;-54,20',
    '10.03.2026;BILLA DANKT;POS 1234;-54,20',
    '05.03.2026;Hausverwaltung;Miete März;-900,00',
    '01.03.2026;Arbeitgeber GmbH;Gehalt;2.400,00',
    'kaputt;x;y;abc',
  ].join('\n');
  const rows = parseCSV(csv);
  const map = detectMapping(rows[0]);
  const base = { existing: [], recurring: [], categories: DEFAULT_CATEGORIES };

  it('Vorzeichen -> Typ, Kategorie, Beschreibung, übersprungene Zeilen', () => {
    const { candidates, skipped } = buildCandidates(rows, 0, map, base);
    expect(skipped).toBe(1);
    expect(candidates).toHaveLength(4);
    expect(candidates[0]).toMatchObject({ date: '2026-03-10', amountCents: 5420, type: 'expense', category: 'Lebensmittel', description: 'BILLA DANKT – POS 1234' });
    expect(candidates[3]).toMatchObject({ type: 'income', amountCents: 240000 });
  });
  it('Duplikate gegen vorhandene Buchungen (mengenbewusst)', () => {
    const { candidates } = buildCandidates(rows, 0, map, { ...base, existing: [entry({})] });
    expect(candidates[0].duplicate).toBe(true);
    expect(candidates[1].duplicate).toBe(false); // zweite identische Zeile ist neu
    expect(candidates[0].selected).toBe(false);
    expect(candidates[1].selected).toBe(true);
  });
  it('Zeilen, die zu Fixposten passen, werden markiert und nicht vorausgewählt', () => {
    const { candidates } = buildCandidates(rows, 0, map, { ...base, recurring: [rec] });
    expect(candidates[2].fixMatch).toBe(true);
    expect(candidates[2].selected).toBe(false);
    expect(candidates[0].fixMatch).toBe(false);
  });
  it('Fixposten außerhalb ihres Zeitraums zählen nicht', () => {
    const { candidates } = buildCandidates(rows, 0, map, { ...base, recurring: [{ ...rec, to: '2026-02' }] });
    expect(candidates[2].fixMatch).toBe(false);
  });
  it('Vorzeichen umkehren', () => {
    const { candidates } = buildCandidates(rows, 0, { ...map, invert: true }, base);
    expect(candidates[0].type).toBe('income');
  });
  it('Soll/Haben-Spalten', () => {
    const r = parseCSV('Datum;Text;Soll;Haben\n01.03.2026;Spar;12,30;\n02.03.2026;Gehalt;;100,00');
    const { candidates } = buildCandidates(r, 0, detectMapping(r[0]), base);
    expect(candidates.map((c) => [c.type, c.amountCents])).toEqual([['expense', 1230], ['income', 10000]]);
  });
});

import { cleanBankText, detectMappingFromData } from '../src/logic/bankcsv';

describe('Export ohne Kopfzeile (George-Stil)', () => {
  const csv = [
    '01.09.2025,"Purpose of use: BILLA DANKT 1234 Card sequence no: 12 Payment reference: 99",31.08.2025,-11.75,EUR,01.09.2025 07:12:01',
    '01.09.2025,"Client: Arbeitgeber GmbH Client IBAN: AT00 Client BIC: XXXX Payment reference: Gehalt",01.09.2025,350,EUR,01.09.2025 00:10:00',
    '02.09.2025,"Payment recipient: Müller Versicherung AG Purpose of use: Nr. 1 Payment recipient IBAN: AT11 Payment recipient BIC: YYYY Mandate: M1",02.09.2025,-18.48,EUR,02.09.2025 02:00:00',
  ].join('\n');
  const rows = parseCSV(csv);
  it('erkennt fehlende Kopfzeile', () => expect(detectHeaderRow(rows)).toBe(-1));
  it('Spalten nach Inhalt', () => {
    const m = detectMappingFromData(rows);
    expect(m.date).toBe(0); expect(m.amount).toBe(3); expect(m.text).toEqual([1]);
  });
  it('bereinigt technischen Ballast', () => {
    expect(cleanBankText('Payment recipient: Müller Versicherung AG Purpose of use: Nr. 1 Payment recipient IBAN: AT11 Payment recipient BIC: YYYY Mandate: M1')).toBe('Müller Versicherung AG – Nr. 1');
    expect(cleanBankText('Purpose of use: BILLA DANKT 1234 Card sequence no: 12 Payment reference: 99')).toBe('BILLA DANKT 1234 – 99');
    expect(cleanBankText('Dauerauftrag Miete')).toBe('Dauerauftrag Miete');
  });
  it('komplette Pipeline ohne Kopfzeile, erste Zeile geht nicht verloren', () => {
    const { candidates } = buildCandidates(rows, -1, detectMappingFromData(rows), { existing: [], recurring: [], categories: DEFAULT_CATEGORIES });
    expect(candidates).toHaveLength(3);
    expect(candidates[0]).toMatchObject({ date: '2025-09-01', amountCents: 1175, type: 'expense', category: 'Lebensmittel' });
    expect(candidates[1]).toMatchObject({ type: 'income', amountCents: 35000 });
  });
});

describe('Gehalt trotz geänderter Höhe als Fixposten erkannt', () => {
  const rows = parseCSV(['01.03.2026;Arbeitgeber GmbH;Lohn/Gehalt 03/2026;2.650,00', '01.03.2026;Max Muster;Rückerstattung Versicherung;120,00'].join('\n').replace(/^/, 'Buchungsdatum;Partnername;Verwendungszweck;Betrag\n'));
  const map = detectMapping(rows[0]);
  const gehalt = { id: 'g', label: 'Gehalt', category: 'Gehalt', type: 'income' as const, amountCents: 240000, rhythm: 'monthly' as const, share1Pct: 50, paidBy: 0 as const };
  const base = { existing: [], categories: DEFAULT_CATEGORIES };
  it('anderer Betrag, aber Gehalt für denselben Kontoinhaber -> Fixposten?', () => {
    const { candidates } = buildCandidates(rows, 0, map, { ...base, recurring: [gehalt], owner: 0 });
    expect(candidates[0]).toMatchObject({ category: 'Gehalt', fixMatch: true, selected: false });
    expect(candidates[1].fixMatch).toBe(false);
  });
  it('Gehalt der anderen Person oder kein aktives Fix-Gehalt -> normal importierbar', () => {
    expect(buildCandidates(rows, 0, map, { ...base, recurring: [gehalt], owner: 1 }).candidates[0].fixMatch).toBe(false);
    expect(buildCandidates(rows, 0, map, { ...base, recurring: [{ ...gehalt, to: '2026-01' }], owner: 0 }).candidates[0].fixMatch).toBe(false);
    expect(buildCandidates(rows, 0, map, { ...base, recurring: [], owner: 0 }).candidates[0].selected).toBe(true);
  });
});

describe('Duplikate: nur auf demselben Konto, Ausgleich mit Datumstoleranz', () => {
  const csv = (date: string, amount: string) => parseCSV(`Buchungsdatum;Partnername;Verwendungszweck;Betrag\n${date};Parkhaus;Parken;${amount}`);
  const ex = (o: Partial<Entry>): Entry => ({ id: Math.random().toString(36), date: '2026-04-10', description: 'Parken', category: 'Mobilität', amountCents: 440, type: 'expense', share1Pct: 50, paidBy: 0, ...o });
  const base = { recurring: [], categories: DEFAULT_CATEGORIES };
  const run = (rows: string[][], existing: Entry[], owner: 0 | 1) => buildCandidates(rows, 0, detectMapping(rows[0]), { ...base, existing, owner }).candidates;

  it('gleiche Parkgebühr auf dem Konto der anderen Person ist keine Dublette', () => {
    const rows = csv('10.04.2026', '-4,40');
    expect(run(rows, [ex({ paidBy: 0 })], 1)[0]).toMatchObject({ duplicate: false, selected: true });
  });
  it('erneuter Import desselben Kontos bleibt eine Dublette', () => {
    const rows = csv('10.04.2026', '-4,40');
    expect(run(rows, [ex({ paidBy: 1 })], 1)[0]).toMatchObject({ duplicate: true, selected: false });
  });
  it('Ausgleich: 1–3 Tage Abstand gelten als bereits erfasst, mehr nicht, falsche Richtung nicht', () => {
    const settle = ex({ type: 'settlement', category: 'Ausgleich', date: '2026-04-10', amountCents: 30000, paidBy: 1 }); // Partner -> Konto-Inhaber 0
    expect(run(csv('13.04.2026', '300,00'), [settle], 0)[0].duplicate).toBe(true);
    expect(run(csv('14.04.2026', '300,00'), [settle], 0)[0].duplicate).toBe(false);
    expect(run(csv('11.04.2026', '-300,00'), [settle], 0)[0].duplicate).toBe(false);
  });
  it('Ausgleich aus der Sicht des anderen Kontos: derselbe Eintrag zählt dort als Ausgabe', () => {
    const settle = ex({ type: 'settlement', category: 'Ausgleich', date: '2026-04-10', amountCents: 30000, paidBy: 1 });
    expect(run(csv('10.04.2026', '-300,00'), [settle], 1)[0].duplicate).toBe(true);
  });
  it('jede vorhandene Ausgleichszahlung deckt nur eine Zeile ab', () => {
    const settle = ex({ type: 'settlement', category: 'Ausgleich', date: '2026-04-10', amountCents: 30000, paidBy: 1 });
    const rows = parseCSV('Buchungsdatum;Partnername;Verwendungszweck;Betrag\n10.04.2026;A;x;300,00\n10.04.2026;B;y;300,00');
    expect(run(rows, [settle], 0).map((c) => c.duplicate)).toEqual([true, false]);
  });
});
