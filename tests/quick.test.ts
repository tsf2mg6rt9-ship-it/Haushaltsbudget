import { describe, expect, it } from 'vitest';
import { parseQuickEntry, type QuickContext } from '../src/logic/quick';
import { DEFAULT_CATEGORIES } from '../src/logic/backup';

// 2026-10-12 ist ein Montag
const ctx: QuickContext = { today: '2026-10-12', names: ['Ich', 'Freund'], categories: DEFAULT_CATEGORIES };
const p = (t: string, c: Partial<QuickContext> = {}) => parseQuickEntry(t, { ...ctx, ...c });

describe('Schnelleingabe', () => {
  it('Beispiel aus der Aufgabe', () => {
    const r = p('gestern 54,20 Billa halbe-halbe ich hab bezahlt');
    expect(r.amountCents).toBe(5420);
    expect(r.date).toBe('2026-10-11');
    expect(r.description).toBe('Billa');
    expect(r.share1Pct).toBe(50);
    expect(r.paidBy).toBe(0);
    expect(r.category).toBe('Lebensmittel');
    expect(r.type).toBe('expense');
  });
  it('Betrag mit €/Euro und Tausenderpunkt', () => {
    expect(p('1.234,50 € Möbelhaus').amountCents).toBe(123450);
    expect(p('Hofer 23 Euro').amountCents).toBe(2300);
    expect(p('Hofer 23 Euro 40').amountCents).toBe(2340);
  });
  it('Datum: heute, vorgestern, Wochentag, TT.MM.', () => {
    expect(p('5 Euro Kaffee').date).toBe('2026-10-12');
    expect(p('vorgestern 5 Euro Kaffee').date).toBe('2026-10-10');
    expect(p('am Freitag 5 Euro Kaffee').date).toBe('2026-10-09');
    expect(p('am Montag 5 Euro Kaffee').date).toBe('2026-10-12');
    expect(p('03.10. 12,90 Pizza').date).toBe('2026-10-03');
    expect(p('03.10.2025 12,90 Pizza').date).toBe('2025-10-03');
  });
  it('TT.MM. in der Zukunft gilt für das Vorjahr', () => {
    expect(p('15.12. 10 Euro Spar').date).toBe('2025-12-15');
  });
  it('Datum wird nicht mit Betrag verwechselt', () => {
    const r = p('03.10. 12,90 Pizza');
    expect(r.amountCents).toBe(1290);
  });
  it('nur ich / nur Name', () => {
    expect(p('Apotheke 12,30 nur ich').share1Pct).toBe(100);
    expect(p('Apotheke 12,30 nur Freund').share1Pct).toBe(0);
    expect(p('Apotheke 12,30 nur freund').share1Pct).toBe(0);
  });
  it('50/50 wird nicht als Betrag erkannt', () => {
    const r = p('Spar 40 Euro 50/50');
    expect(r.amountCents).toBe(4000);
    expect(r.share1Pct).toBe(50);
  });
  it('Prozentangaben', () => {
    expect(p('Tanken 60 Euro 70 Prozent ich').share1Pct).toBe(70);
    expect(p('Tanken 60 Euro 70% Freund').share1Pct).toBe(30);
  });
  it('Wer hat bezahlt', () => {
    expect(p('Billa 10 Euro Freund hat bezahlt').paidBy).toBe(1);
    expect(p('Billa 10 Euro bezahlt von Freund').paidBy).toBe(1);
    expect(p('Billa 10 Euro ich habe bezahlt').paidBy).toBe(0);
    expect(p('Billa 10 Euro').paidBy).toBe(0);
  });
  it('benutzerdefinierte Namen', () => {
    const c = { names: ['Anna', 'Ben'] as [string, string] };
    expect(p('Spar 10 Euro nur Ben', c).share1Pct).toBe(0);
    expect(p('Spar 10 Euro Ben hat bezahlt', c).paidBy).toBe(1);
    expect(p('Spar 10 Euro nur Anna', c).share1Pct).toBe(100);
  });
  it('Einnahme', () => {
    const r = p('Gehalt 2.500 Euro');
    expect(r.type).toBe('income');
    expect(r.amountCents).toBe(250000);
  });
  it('gelernte Händler-Kategorie hat Vorrang', () => {
    expect(p('Fressnapf 20 Euro', { learned: { fressnapf: 'Haustier' }, categories: [...DEFAULT_CATEGORIES, 'Haustier'] }).category).toBe('Haustier');
  });
  it('Unbekanntes -> Sonstiges, fehlender Betrag -> null', () => {
    const r = p('irgendwas Komisches');
    expect(r.category).toBe('Sonstiges');
    expect(r.amountCents).toBeNull();
  });
  it('Hashtags', () => {
    const r = p('gestern 54,20 Billa #Urlaub #Frankreich-Reise halbe-halbe');
    expect(r.tags).toEqual(['Urlaub', 'Frankreich Reise']);
    expect(r.description).toBe('Billa');
    expect(r.amountCents).toBe(5420);
    expect(p('Billa 10 Euro hashtag Geburtstag').tags).toEqual(['Geburtstag']);
    expect(p('Billa 10 Euro').tags).toEqual([]);
  });
});
