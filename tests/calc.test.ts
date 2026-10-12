import { describe, expect, it } from 'vitest';
import { computeSettlement, isActive, monthlyCents, summarizeMonth } from '../src/logic/calc';
import { buildPlan, averageVariable } from '../src/logic/planning';
import type { Entry, Recurring } from '../src/logic/types';

const entry = (o: Partial<Entry>): Entry => ({
  id: Math.random().toString(36), date: '2026-03-10', description: 'x', category: 'Sonstiges', amountCents: 10000,
  type: 'expense', share1Pct: 50, paidBy: 0, ...o,
});
const rec = (o: Partial<Recurring>): Recurring => ({
  id: Math.random().toString(36), label: 'Miete', category: 'Wohnen', type: 'expense', amountCents: 100000,
  rhythm: 'monthly', share1Pct: 50, paidBy: 0, ...o,
});

describe('Ausgleich', () => {
  it('Person 1 zahlt 100, 50/50 -> Person 2 überweist 50', () => {
    const s = summarizeMonth('2026-03', [entry({ amountCents: 10000 })], []);
    expect(s.settlement).toEqual({ from: 1, to: 0, amountCents: 5000 });
  });
  it('Person 2 zahlt, Person 1 überweist', () => {
    const s = summarizeMonth('2026-03', [entry({ amountCents: 10000, paidBy: 1 })], []);
    expect(s.settlement).toEqual({ from: 0, to: 1, amountCents: 5000 });
  });
  it('"nur ich" (100 %) und selbst bezahlt -> kein Ausgleich', () => {
    const s = summarizeMonth('2026-03', [entry({ share1Pct: 100, paidBy: 0 })], []);
    expect(s.settlement.amountCents).toBe(0);
    expect(s.settlement.from).toBeNull();
  });
  it('Person 1 zahlt für Person 2 allein (0 %) -> Person 2 schuldet alles', () => {
    const s = summarizeMonth('2026-03', [entry({ share1Pct: 0, paidBy: 0 })], []);
    expect(s.settlement).toEqual({ from: 1, to: 0, amountCents: 10000 });
  });
  it('Mehrere Posten saldieren sich', () => {
    const s = summarizeMonth('2026-03', [
      entry({ amountCents: 10000, paidBy: 0 }),
      entry({ amountCents: 6000, paidBy: 1 }),
    ], []);
    // P1 vorgestreckt 100, P2 60; Anteil je 80 -> P2 überweist 20
    expect(s.settlement).toEqual({ from: 1, to: 0, amountCents: 2000 });
  });
  it('Einnahmen beeinflussen den Ausgleich NICHT', () => {
    const base = summarizeMonth('2026-03', [entry({})], []);
    const withIncome = summarizeMonth('2026-03', [entry({}), entry({ type: 'income', amountCents: 300000, paidBy: 1 })], []);
    expect(withIncome.settlement).toEqual(base.settlement);
    expect(withIncome.totalIncome).toBe(300000);
    expect(withIncome.totalExpense).toBe(10000);
  });
  it('Ausgleich nach Überweisung: beide tragen exakt ihren Anteil', () => {
    const s = summarizeMonth('2026-03', [entry({ amountCents: 9999, share1Pct: 30, paidBy: 1 })], []);
    const { settlement: st, paid, expenseShare } = s;
    const after: [number, number] = [paid[0], paid[1]];
    after[st.from!] += st.amountCents;
    after[st.to!] -= st.amountCents;
    expect(after).toEqual(expenseShare);
  });
  it('computeSettlement direkt', () => {
    expect(computeSettlement([0, 0], [0, 0]).amountCents).toBe(0);
  });
});

describe('Fixkosten', () => {
  it('fließen in gültige Monate, nicht davor/danach', () => {
    const r = rec({ from: '2026-02', to: '2026-04' });
    expect(isActive(r, '2026-01')).toBe(false);
    expect(isActive(r, '2026-02')).toBe(true);
    expect(isActive(r, '2026-04')).toBe(true);
    expect(isActive(r, '2026-05')).toBe(false);
  });
  it('ohne ab/bis unbegrenzt', () => {
    expect(isActive(rec({}), '1999-01')).toBe(true);
    expect(isActive(rec({}), '2099-12')).toBe(true);
  });
  it('Rhythmus rechnet auf Monate um', () => {
    expect(monthlyCents({ amountCents: 120000, rhythm: 'yearly' })).toBe(10000);
    expect(monthlyCents({ amountCents: 30000, rhythm: 'quarterly' })).toBe(10000);
    expect(monthlyCents({ amountCents: 5000, rhythm: 'monthly' })).toBe(5000);
  });
  it('Feste Einnahmen zählen zur Person; Fixausgaben zum Ausgleich', () => {
    const s = summarizeMonth('2026-03', [], [
      rec({ type: 'income', label: 'Gehalt', amountCents: 250000, paidBy: 0 }),
      rec({ type: 'income', label: 'Gehalt', amountCents: 300000, paidBy: 1 }),
      rec({ amountCents: 90000, paidBy: 0 }),
    ]);
    expect(s.income).toEqual([250000, 300000]);
    expect(s.expenseShare).toEqual([45000, 45000]);
    expect(s.net).toEqual([205000, 255000]);
    expect(s.settlement).toEqual({ from: 1, to: 0, amountCents: 45000 });
  });
  it('Variable Buchungen nur im eigenen Monat', () => {
    const e = entry({ date: '2026-04-01' });
    expect(summarizeMonth('2026-03', [e], []).lines).toHaveLength(0);
    expect(summarizeMonth('2026-04', [e], []).lines).toHaveLength(1);
  });
  it('Umbau kann ausgeschlossen werden', () => {
    const e = entry({ umbau: { trade: 'Elektriker', paid: true } });
    expect(summarizeMonth('2026-03', [e], [], { includeUmbau: false }).totalExpense).toBe(0);
    expect(summarizeMonth('2026-03', [e], []).totalExpense).toBe(10000);
  });
  it('Kategorien werden summiert', () => {
    const s = summarizeMonth('2026-03', [entry({ category: 'A', amountCents: 100 }), entry({ category: 'A', amountCents: 200 }), entry({ category: 'B', amountCents: 50 })], []);
    expect(s.byCategory).toEqual([{ category: 'A', cents: 300 }, { category: 'B', cents: 50 }]);
  });
});

describe('Planung', () => {
  it('kumuliert Netto mit Startbestand', () => {
    const recs = [rec({ type: 'income', amountCents: 300000, paidBy: 0 }), rec({ amountCents: 100000 })];
    const plan = buildPlan([], recs, '2026-03', 3, 50000, 20000);
    expect(plan[0].net).toBe(200000); // aktueller Monat: keine Schätzung, nur Gebuchtes
    expect(plan[1].net).toBe(300000 - 100000 - 20000);
    expect(plan[2].cumulative).toBe(50000 + 200000 + 180000 + 180000);
  });
  it('zukünftige Umbau-Rechnungen belasten den Monat', () => {
    const e = entry({ date: '2026-05-15', amountCents: 500000, umbau: { trade: 'Maler', paid: false } });
    const plan = buildPlan([e], [], '2026-03', 4, 0, 0);
    expect(plan[2].umbau).toBe(500000);
    expect(plan[3].cumulative).toBe(-500000);
  });
  it('Durchschnitt variabler Ausgaben ab erstem Eintrag', () => {
    const es = [entry({ date: '2026-01-10', amountCents: 30000 }), entry({ date: '2026-02-10', amountCents: 50000 })];
    expect(averageVariable(es, '2026-03', 3)).toBe(40000);
    expect(averageVariable([], '2026-03')).toBe(0);
  });
});

import { affordability, annuityPayment, principalFromPayment, worstMonth } from '../src/logic/loan';

describe('Kredit', () => {
  it('Annuität: 200.000 € / 4 % / 25 Jahre ≈ 1.055,67 €', () => {
    expect(annuityPayment(20000000, 4, 300)).toBe(105567);
  });
  it('0 % Zins = Summe / Monate', () => {
    expect(annuityPayment(120000, 0, 12)).toBe(10000);
    expect(principalFromPayment(10000, 0, 12)).toBe(120000);
  });
  it('Rate <-> Summe sind (fast) invers', () => {
    const p = principalFromPayment(105567, 4, 300);
    expect(Math.abs(p - 20000000)).toBeLessThan(5000);
  });
  it('Leistbare Rate = Einnahmen − Fix − variabel − Puffer', () => {
    const recs = [rec({ type: 'income', amountCents: 500000 }), rec({ amountCents: 200000 })];
    const a = affordability('2026-11', recs, 100000, 10);
    expect(a.buffer).toBe(50000);
    expect(a.freeRaw).toBe(500000 - 200000 - 100000 - 50000);
    expect(a.free).toBe(150000);
  });
  it('freier Betrag nie negativ, Rohwert schon', () => {
    const a = affordability('2026-11', [rec({ amountCents: 100000 })], 0, 0);
    expect(a.free).toBe(0);
    expect(a.freeRaw).toBe(-100000);
  });
  it('ungünstigster Monat berücksichtigt Fix-Änderungen (z. B. Strom ab Februar)', () => {
    const recs = [rec({ type: 'income', amountCents: 500000 }), rec({ amountCents: 100000 }), rec({ label: 'Strom', amountCents: 20000, from: '2027-02' })];
    const w = worstMonth('2026-11', 12, recs, 0, 0);
    expect(w.ym).toBe('2027-02');
    expect(w.free).toBe(380000);
  });
});

describe('Kredit: Solo-Szenario', () => {
  const recs = [
    rec({ type: 'income', amountCents: 240000, paidBy: 0 }),
    rec({ type: 'income', amountCents: 260000, paidBy: 1 }),
    rec({ amountCents: 80000, share1Pct: 50 }),
  ];
  it('nur Person 1, voller Betrag', () => {
    const a = affordability('2026-11', recs, 72000, 10, { person: 0, fullFixed: true });
    expect(a.income).toBe(240000);
    expect(a.fixed).toBe(80000);
    expect(a.freeRaw).toBe(240000 - 80000 - 72000 - 24000);
  });
  it('nur bisheriger Anteil', () => {
    const a = affordability('2026-11', recs, 0, 0, { person: 0, fullFixed: false });
    expect(a.fixed).toBe(40000);
  });
  it('Person 2 hat eigenes Einkommen', () => {
    expect(affordability('2026-11', recs, 0, 0, { person: 1, fullFixed: true }).income).toBe(260000);
  });
  it('Gemeinsam bleibt unverändert', () => {
    const a = affordability('2026-11', recs, 0, 0);
    expect(a.income).toBe(500000);
    expect(a.fixed).toBe(80000);
  });
});
