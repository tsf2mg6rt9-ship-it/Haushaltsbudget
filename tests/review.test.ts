import { describe, expect, it } from 'vitest';
import { findFlags } from '../src/logic/review';
import type { Entry, Recurring } from '../src/logic/types';

const e = (o: Partial<Entry>): Entry => ({ id: Math.random().toString(36).slice(2), date: '2026-03-10', description: 'x', category: 'Sonstiges', amountCents: 5000, type: 'expense', share1Pct: 50, paidBy: 0, ...o });
const rec = (o: Partial<Recurring>): Recurring => ({ id: 'r' + Math.random(), label: 'Miete', category: 'Wohnen', type: 'expense', amountCents: 70000, rhythm: 'monthly', share1Pct: 50, paidBy: 0, ...o });
const gehalt = rec({ label: 'Gehalt', category: 'Gehalt', type: 'income', amountCents: 240000, paidBy: 0, from: '2026-01' });
const kinds = (m: Map<string, unknown[]>, id: string) => (m.get(id) as { kind: string }[] | undefined)?.map((f) => f.kind);

describe('Prüfung bestehender Buchungen', () => {
  it('Gehalt zusätzlich zum Fix-Gehalt (auch bei anderer Höhe)', () => {
    const x = e({ type: 'income', category: 'Gehalt', amountCents: 265000, description: 'Lohn/Gehalt 03/2026' });
    expect(kinds(findFlags([x], [gehalt]), x.id)).toEqual(['gehalt']);
  });
  it('kein Hinweis ohne aktives Fix-Gehalt oder bei anderer Person / außerhalb des Zeitraums', () => {
    const x = e({ type: 'income', category: 'Gehalt', amountCents: 265000 });
    expect(findFlags([x], []).size).toBe(0);
    expect(findFlags([x], [{ ...gehalt, paidBy: 1 }]).size).toBe(0);
    expect(findFlags([x], [{ ...gehalt, to: '2026-02' }]).size).toBe(0);
  });
  it('Fixposten doppelt (gleicher Betrag und Kategorie bzw. Bezeichnung)', () => {
    const a = e({ amountCents: 70000, category: 'Wohnen', description: 'Hausverwaltung' });
    const b = e({ amountCents: 70000, category: 'Sonstiges', description: 'Miete März' });
    const c = e({ amountCents: 70000, category: 'Sonstiges', description: 'Etwas anderes' });
    const m = findFlags([a, b, c], [rec({})]);
    expect(kinds(m, a.id)).toEqual(['fix']);
    expect(kinds(m, b.id)).toEqual(['fix']);
    expect(m.has(c.id)).toBe(false);
  });
  it('Dubletten: erste bleibt unmarkiert', () => {
    const a = e({ id: 'a1', description: 'Billa' }), b = e({ id: 'b2', description: 'billa' }), c = e({ id: 'c3', description: 'Billa', date: '2026-03-11' });
    const m = findFlags([a, b, c], []);
    expect([a, b, c].filter((x) => m.has(x.id))).toHaveLength(1);
    expect(kinds(m, b.id)).toEqual(['dublette']);
  });
  it('Zahlung vom Partner als Einnahme, Umbuchung auf eigenes Konto', () => {
    const p = e({ type: 'income', description: 'Ghezzi Andrea – Rent', amountCents: 35000 });
    const r = e({ description: 'REVOLUT**1234* DUBLIN' });
    const m = findFlags([p, r], [], ['Ghezzi']);
    expect(kinds(m, p.id)).toEqual(['partner']);
    expect(kinds(m, r.id)).toEqual(['umbuchung']);
  });
  it('Ausgleich, bestätigte und Umbau-Buchungen werden nicht gemeldet', () => {
    const s = e({ type: 'settlement', description: 'Ghezzi', amountCents: 70000 });
    const ok = e({ type: 'income', category: 'Gehalt', checked: true });
    const u = e({ amountCents: 70000, category: 'Wohnen', umbau: { trade: 'x', paid: true } });
    expect(findFlags([s, ok, u], [gehalt, rec({})], ['Ghezzi']).size).toBe(0);
  });
});
