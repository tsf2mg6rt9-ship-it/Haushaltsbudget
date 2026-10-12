import { splitCents } from './money';
import type { Entry, Line, Recurring, Settings } from './types';
import { monthlyCents } from './calc';

/** CSV für Apple Numbers/Excel (DE): Semikolon, Komma als Dezimaltrenner, UTF-8 mit BOM. */
export function toCSV(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

const eurNum = (c: number) => (c / 100).toFixed(2).replace('.', ',');

export function entriesCSV(entries: Entry[], settings: Settings): string {
  const [n1, n2] = settings.names;
  const rows: (string | number)[][] = [[
    'Datum', 'Typ', 'Beschreibung', 'Kategorie', 'Betrag EUR', `Anteil ${n1} %`, `Anteil ${n1} EUR`, `Anteil ${n2} EUR`,
    'Bezahlt von / Empfänger', 'Umbau-Gewerk', 'Rechnungsnr.', 'Umbau bezahlt', 'Notiz',
  ]];
  for (const e of [...entries].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const [s1, s2] = splitCents(e.amountCents, e.share1Pct);
    rows.push([
      e.date, e.type === 'expense' ? 'Ausgabe' : 'Einnahme', e.description, e.category, eurNum(e.amountCents),
      e.type === 'expense' ? String(e.share1Pct).replace('.', ',') : '',
      e.type === 'expense' ? eurNum(s1) : '', e.type === 'expense' ? eurNum(s2) : '',
      settings.names[e.paidBy], e.umbau?.trade ?? '', e.umbau?.invoiceNo ?? '',
      e.umbau ? (e.umbau.paid ? 'ja' : 'nein') : '', e.note ?? '',
    ]);
  }
  return toCSV(rows);
}

export function recurringCSV(recurring: Recurring[], settings: Settings): string {
  const rows: (string | number)[][] = [[
    'Bezeichnung', 'Typ', 'Kategorie', 'Betrag je Zahlung EUR', 'Rhythmus', 'Pro Monat EUR', `Anteil ${settings.names[0]} %`,
    'Bezahlt von / Empfänger', 'Ab', 'Bis',
  ]];
  const rh = { monthly: 'monatlich', quarterly: 'quartalsweise', yearly: 'jährlich' };
  for (const r of recurring) {
    rows.push([
      r.label, r.type === 'expense' ? 'Ausgabe' : 'Einnahme', r.category, eurNum(r.amountCents), rh[r.rhythm],
      eurNum(monthlyCents(r)), String(r.share1Pct).replace('.', ','), settings.names[r.paidBy], r.from ?? '', r.to ?? '',
    ]);
  }
  return toCSV(rows);
}

export function monthCSV(ym: string, lines: Line[], settings: Settings): string {
  const rows: (string | number)[][] = [['Monat', 'Quelle', 'Datum', 'Typ', 'Beschreibung', 'Kategorie', 'Betrag EUR', `Anteil ${settings.names[0]} EUR`, `Anteil ${settings.names[1]} EUR`, 'Bezahlt von / Empfänger']];
  for (const l of lines) {
    const [s1, s2] = splitCents(l.amountCents, l.share1Pct);
    rows.push([
      ym, l.source === 'recurring' ? 'Fix' : 'Buchung', l.date ?? '', l.type === 'expense' ? 'Ausgabe' : 'Einnahme', l.description,
      l.category, eurNum(l.amountCents), l.type === 'expense' ? eurNum(s1) : '', l.type === 'expense' ? eurNum(s2) : '', settings.names[l.paidBy],
    ]);
  }
  return toCSV(rows);
}
