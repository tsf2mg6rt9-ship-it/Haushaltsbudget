import { describe, expect, it } from 'vitest';
import { suggestFix } from '../src/logic/fixsuggest';
import type { Entry } from '../src/logic/types';

let n = 0;
const e = (date: string, description: string, o: Partial<Entry> = {}): Entry => ({ id: `e${++n}`, date, description, category: 'Abos', amountCents: 1299, type: 'expense', share1Pct: 50, paidBy: 0, ...o });

describe('Fixposten aus Buchung vorschlagen', () => {
  it('monatlich: Name ohne Codes, erster Monat, alle gleichen Buchungen', () => {
    const pool = ['2026-01', '2026-02', '2026-03', '2026-04'].map((m, i) => e(`${m}-05`, `Netflix International BV 4711${i} – Abo`));
    pool.push(e('2026-02-07', 'Billa'));
    const s = suggestFix(pool, pool[3]);
    expect(s.label).toBe('Netflix International BV');
    expect(s.from).toBe('2026-01');
    expect(s.rhythm).toBe('monthly');
    expect(s.dueMonth).toBeUndefined();
    expect(s.matches).toHaveLength(4);
  });
  it('jährlich: Abstände von 12 Monaten, Abbuchungsmonat aus der Buchung', () => {
    const pool = [e('2023-06-12', 'Europäische Reiseversicherung AG'), e('2024-06-11', 'Europäische Reiseversicherung AG'), e('2025-06-13', 'Europäische Reiseversicherung AG')];
    const s = suggestFix(pool, pool[2]);
    expect(s).toMatchObject({ rhythm: 'yearly', dueMonth: 6, from: '2023-06' });
  });
  it('quartalsweise: Abstände von 3 Monaten', () => {
    const pool = [e('2026-02-01', 'Haushaltsversicherung Uniqa'), e('2026-05-01', 'Haushaltsversicherung Uniqa'), e('2026-08-01', 'Haushaltsversicherung Uniqa')];
    expect(suggestFix(pool, pool[0])).toMatchObject({ rhythm: 'quarterly', dueMonth: 2, from: '2026-02' });
  });
  it('einzelne Buchung: monatlich ab ihrem Monat', () => {
    const only = e('2026-03-09', 'Fitnessstudio Muster');
    expect(suggestFix([only], only)).toMatchObject({ rhythm: 'monthly', from: '2026-03' });
  });
  it('andere Art, Umbau und Ausgleich zählen nicht als gleiche Buchung', () => {
    const a = e('2026-01-05', 'Gehalt Arbeitgeber GmbH', { type: 'income' });
    const b = e('2026-02-05', 'Gehalt Arbeitgeber GmbH', { type: 'expense' });
    const c = e('2026-03-05', 'Gehalt Arbeitgeber GmbH', { type: 'income', umbau: { trade: 'x', paid: true } });
    const d = e('2026-04-05', 'Gehalt Arbeitgeber GmbH', { type: 'settlement' });
    expect(suggestFix([a, b, c, d], a).matches.map((x) => x.id)).toEqual([a.id]);
  });
  it('Fallback bei leerer Beschreibung: Kategorie', () => {
    const x = e('2026-03-09', '', { category: 'Wohnen' });
    expect(suggestFix([x], x).label).toBe('Wohnen');
  });
});
