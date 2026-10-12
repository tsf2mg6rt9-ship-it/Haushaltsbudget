import { describe, expect, it } from 'vitest';
import { closeMonths, cumulativeSettlement, firstDataMonth, summarizeMonth } from '../src/logic/calc';
import { buildOverview } from '../src/logic/overview';
import { DEFAULT_SETTINGS, makeBackup, parseBackup } from '../src/logic/backup';
import type { Entry } from '../src/logic/types';

const e = (o: Partial<Entry>): Entry => ({ id: Math.random().toString(36).slice(2), date: '2026-01-10', description: 'x', category: 'Freizeit', amountCents: 10000, type: 'expense', share1Pct: 50, paidBy: 0, ...o });

describe('Monate als ausgeglichen markieren', () => {
  const entries = [e({ date: '2026-01-10' }), e({ date: '2026-02-10', amountCents: 30000 }), e({ date: '2026-03-10', paidBy: 1, amountCents: 4000 })];
  it('Gesamtsaldo ohne Markierung', () => {
    // Jan: P2 schuldet 50; Feb: P2 schuldet 150; Mär: P1 schuldet 20 -> P2 schuldet 180
    expect(cumulativeSettlement(entries, [], '2026-03')).toEqual({ from: 1, to: 0, amountCents: 18000 });
  });
  it('markierter Monat zählt mit 0', () => {
    const closed = { '2026-02': { balance1: 15000 } };
    expect(cumulativeSettlement(entries, [], '2026-03', closed)).toEqual({ from: 1, to: 0, amountCents: 3000 });
  });
  it('alle Monate bis Stichtag markieren speichert die Differenzen und lässt bereits Markiertes unangetastet', () => {
    const closed = closeMonths(entries, [], firstDataMonth(entries, [], '2026-02'), '2026-02', { '2026-01': { balance1: 111 } });
    expect(closed).toEqual({ '2026-01': { balance1: 111 }, '2026-02': { balance1: 15000 } });
    expect(cumulativeSettlement(entries, [], '2026-03', closed)).toEqual({ from: 0, to: 1, amountCents: 2000 });
  });
  it('Zahlen bleiben unverändert (Einnahmen, Ausgaben, Anteile, Überblick)', () => {
    const before = summarizeMonth('2026-02', entries, []);
    // Markierung ist reine Anzeige-/Saldo-Sache und taucht in summarizeMonth nicht auf
    expect(before.totalExpense).toBe(30000);
    expect(before.expenseShare).toEqual([15000, 15000]);
    expect(before.totalIncome).toBe(0);
    const o = buildOverview(entries, [], { endYM: '2026-03', months: 'all', includeUmbau: true });
    expect(o.expense.total).toBe(44000);
  });
  it('Backup behält Markierungen und verwirft ungültige', () => {
    const r = parseBackup(JSON.stringify(makeBackup({ ...DEFAULT_SETTINGS, closedMonths: { '2026-02': { balance1: 15000 } } }, [], [])));
    expect(r.ok && r.data.settings.closedMonths).toEqual({ '2026-02': { balance1: 15000 } });
    const bad = makeBackup(DEFAULT_SETTINGS, [], []);
    (bad.settings as unknown as { closedMonths: unknown }).closedMonths = { kaputt: { balance1: 1 }, '2026-01': { balance1: 'x' } };
    const r2 = parseBackup(JSON.stringify(bad));
    expect(r2.ok && r2.data.settings.closedMonths).toEqual({});
  });
});
