import { describe, expect, it } from 'vitest';
import { filterLinesByWho, summarizeLines, summarizeMonth } from '../src/logic/calc';
import type { Entry, Recurring } from '../src/logic/types';

let n = 0;
const e = (o: Partial<Entry>): Entry => ({ id: `e${++n}`, date: '2026-03-10', description: 'x', category: 'Sonstiges', amountCents: 10000, type: 'expense', share1Pct: 50, paidBy: 0, ...o });
const entries = [
  e({ description: 'Miete-Anteil gemeinsam, ich', paidBy: 0, share1Pct: 50, amountCents: 80000 }),
  e({ description: 'privat ich', paidBy: 0, share1Pct: 100, amountCents: 3000 }),
  e({ description: 'privat er', paidBy: 1, share1Pct: 0, amountCents: 4000 }),
  e({ description: 'Einkauf gemeinsam, er', paidBy: 1, share1Pct: 50, amountCents: 6000 }),
  e({ description: 'Anteil 70/30, ich', paidBy: 0, share1Pct: 70, amountCents: 1000 }),
  e({ type: 'income', description: 'Gehalt ich', paidBy: 0, amountCents: 250000 }),
  e({ type: 'income', description: 'Gehalt er', paidBy: 1, amountCents: 300000 }),
  e({ type: 'settlement', description: 'Ausgleich', paidBy: 1, amountCents: 5000 }),
];
const rec: Recurring[] = [{ id: 'r', label: 'Internet', category: 'Abos', type: 'expense', amountCents: 3500, rhythm: 'monthly', share1Pct: 50, paidBy: 1 }];
const lines = summarizeMonth('2026-03', entries, rec).lines;
const names = (w: Parameters<typeof filterLinesByWho>[1]) => filterLinesByWho(lines, w).map((l) => l.description).sort();

describe('Monat: Sicht nach Person / gemeinsam', () => {
  it('Alle: unverändert', () => expect(filterLinesByWho(lines, 'all')).toBe(lines));
  it('Person: alles, was sie bezahlt/erhalten hat (inkl. gemeinsam Bezahltem), plus Ausgleich', () => {
    expect(names('0')).toEqual([...['Ausgleich', 'Anteil 70/30, ich', 'Gehalt ich', 'Miete-Anteil gemeinsam, ich', 'privat ich'].sort()]);
    expect(names('1')).toEqual([...['Ausgleich', 'Einkauf gemeinsam, er', 'Gehalt er', 'Internet', 'privat er'].sort()]);
  });
  it('Gemeinsam: nur geteilte Ausgaben (keine rein privaten, keine Einnahmen), plus Ausgleich', () => {
    expect(names('shared')).toEqual([...['Ausgleich', 'Anteil 70/30, ich', 'Einkauf gemeinsam, er', 'Internet', 'Miete-Anteil gemeinsam, ich'].sort()]);
  });
  it('beide Personen-Sichten zusammen ergeben alle Ausgaben und Einnahmen', () => {
    const a = summarizeLines('2026-03', filterLinesByWho(lines, '0'));
    const b = summarizeLines('2026-03', filterLinesByWho(lines, '1'));
    const all = summarizeMonth('2026-03', entries, rec);
    expect(a.totalExpense + b.totalExpense).toBe(all.totalExpense);
    expect(a.totalIncome + b.totalIncome).toBe(all.totalIncome);
  });
  it('Zahlen der gefilterten Sicht: Person 1 hat 84.000 € bezahlt, davon sein Anteil 43.700 €', () => {
    const a = summarizeLines('2026-03', filterLinesByWho(lines, '0'));
    expect(a.paid[0]).toBe(80000 + 3000 + 1000);
    expect(a.expenseShare[0]).toBe(40000 + 3000 + 700);
    expect(a.totalIncome).toBe(250000);
  });
});
