import { isValidISO, ymOf } from './dates';
import { monthlyCents, isActive } from './calc';
import { guessCategory } from './quick';
import type { Entry, EntryType, ISODate, Recurring } from './types';

/** Trennzeichen erraten (Semikolon, Komma, Tab). */
export function detectDelimiter(text: string): string {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let best = ';';
  let bestScore = -1;
  for (const d of [';', '\t', ',']) {
    const counts = lines.map((l) => l.split(d).length - 1);
    const min = Math.min(...counts, Infinity);
    const score = min > 0 ? min * 1000 + counts.reduce((a, b) => a + b, 0) : counts.reduce((a, b) => a + b, 0) / 1000;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/** Einfacher CSV-Parser mit Anführungszeichen und Zeilenumbrüchen in Feldern. */
export function parseCSV(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

/** Datum in TT.MM.JJJJ, TT.MM.JJ, TT/MM/JJJJ, JJJJ-MM-TT (auch mit Uhrzeit). */
export function parseBankDate(input: string): ISODate | null {
  const s = input.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (m) return isValidISO(`${m[1]}-${m[2]}-${m[3]}`) ? `${m[1]}-${m[2]}-${m[3]}` : null;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?:[\s,T].*)?$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const iso = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isValidISO(iso) ? iso : null;
  }
  return null;
}

/** Betrag mit Vorzeichen in Cent. Versteht "-1.234,56", "1,234.56", "+12,50", "12,50-", "12,50 EUR". */
export function parseBankAmount(input: string): number | null {
  let s = input.trim().replace(/\s|€|eur|euro/gi, '');
  if (!s) return null;
  let neg = false;
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  else if (s.startsWith('+')) s = s.slice(1);
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (!/^[\d.,']+$/.test(s)) return null;
  s = s.replace(/'/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart: string;
  let frac = '';
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = Math.max(lastComma, lastDot);
    intPart = s.slice(0, dec).replace(/[.,]/g, '');
    frac = s.slice(dec + 1);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const idx = s.lastIndexOf(sep);
    const after = s.length - idx - 1;
    const count = s.split(sep).length - 1;
    if (count > 1 || after === 3) {
      if (count > 1 || sep === '.') intPart = s.split(sep).join(''); // Tausendertrenner
      else { intPart = s.slice(0, idx); frac = s.slice(idx + 1); }
      if (count === 1 && sep === ',' && after === 3) { intPart = s.slice(0, idx); frac = s.slice(idx + 1); }
    } else {
      intPart = s.slice(0, idx);
      frac = s.slice(idx + 1);
    }
  } else intPart = s;
  if (frac.length > 2 || !/^\d*$/.test(frac) || !/^\d*$/.test(intPart)) return null;
  if (intPart === '' && frac === '') return null;
  const cents = parseInt(intPart || '0', 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  return neg ? -cents : cents;
}

export interface Mapping {
  date: number | null;
  /** Spalte mit vorzeichenbehaftetem Betrag */
  amount: number | null;
  /** Alternativ: getrennte Soll-/Haben-Spalten */
  debit: number | null;
  credit: number | null;
  /** Spalten für die Beschreibung (Partner, Verwendungszweck …) */
  text: number[];
  /** Vorzeichen umkehren (z. B. bei Kreditkartenabrechnungen) */
  invert: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-zäöüß ]/g, ' ').replace(/\s+/g, ' ').trim();
const DATE_KEYS = ['buchungsdatum', 'buchungstag', 'booking date', 'datum', 'date', 'valuta', 'wertstellung'];
const AMOUNT_KEYS = ['betrag', 'umsatz', 'amount', 'summe'];
const DEBIT_KEYS = ['soll', 'belastung', 'debit', 'ausgang'];
const CREDIT_KEYS = ['haben', 'gutschrift', 'credit', 'eingang'];
const PARTNER_KEYS = ['partner', 'empfänger', 'empfaenger', 'auftraggeber', 'payee', 'beneficiary', 'name'];
const TEXT_KEYS = ['verwendungszweck', 'buchungstext', 'zahlungsreferenz', 'payment reference', 'beschreibung', 'description', 'details', 'reference', 'text'];

function findCol(header: string[], keys: string[]): number | null {
  for (const k of keys) {
    const i = header.findIndex((h) => { const n = norm(h); return n === k || n.startsWith(k + ' ') || n.includes(k); });
    if (i >= 0) return i;
  }
  return null;
}

/** Kopfzeile finden (manche Banken schreiben Infozeilen davor). */
export function detectHeaderRow(rows: string[][]): number {
  const all = [...DATE_KEYS, ...AMOUNT_KEYS, ...PARTNER_KEYS, ...TEXT_KEYS, ...DEBIT_KEYS, ...CREDIT_KEYS];
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const hits = rows[i].filter((c) => { const n = norm(c); return n && all.some((k) => n === k || n.includes(k)); }).length;
    if (hits >= 2) return i;
  }
  // Keine Kopfzeile erkannt: Wenn die erste Zeile schon ein Datum enthält, sind es reine Daten (z. B. George-Export).
  if (rows[0]?.some((c) => parseBankDate(c) !== null)) return -1;
  return 0;
}

/** Spaltenzuordnung nach Inhalt, wenn es keine Kopfzeile gibt. */
export function detectMappingFromData(rows: string[][]): Mapping {
  const sample = rows.slice(0, 30);
  const cols = Math.max(...sample.map((r) => r.length));
  const frac = (col: number, test: (v: string) => boolean) => {
    const vals = sample.map((r) => (r[col] ?? '').trim()).filter(Boolean);
    return vals.length === 0 ? 0 : vals.filter(test).length / vals.length;
  };
  const isDate = (c: number) => frac(c, (v) => parseBankDate(v) !== null) >= 0.8;
  const isAmount = (c: number) => !isDate(c) && frac(c, (v) => /^[+-]?\(?\d[\d.,']*\)?-?$/.test(v.replace(/\s|€|eur/gi, '')) && parseBankAmount(v) !== null) >= 0.8;
  let date: number | null = null;
  let amount: number | null = null;
  for (let c = 0; c < cols; c++) {
    if (date === null && isDate(c)) date = c;
    if (amount === null && isAmount(c)) amount = c;
  }
  let text: number | null = null;
  let best = 0;
  for (let c = 0; c < cols; c++) {
    if (c === date || c === amount || isDate(c)) continue;
    const avg = sample.reduce((a, r) => a + (r[c] ?? '').length, 0) / sample.length;
    if (avg > best) { best = avg; text = c; }
  }
  return { date, amount, debit: null, credit: null, text: text === null ? [] : [text], invert: false };
}

const LABELS = [
  'Payment recipient IBAN', 'Payment recipient BIC', 'Payment recipient', 'Client IBAN', 'Client BIC', 'Client reference', 'Client',
  'Recipient IBAN', 'Recipient BIC', 'Recipient ID', 'Recipient', 'Purpose of use', 'Payment reference', 'Card sequence no', 'Mandate', 'Creditor ID',
  'Zahlungsempfänger IBAN', 'Zahlungsempfänger BIC', 'Zahlungsempfänger', 'Auftraggeber IBAN', 'Auftraggeber BIC', 'Auftraggeberreferenz',
  'Auftraggeber', 'Empfänger IBAN', 'Empfänger BIC', 'Empfänger', 'Verwendungszweck', 'Zahlungsreferenz', 'Kartenfolgenummer', 'Mandat', 'Gläubiger-ID',
];
const KEEP = ['payment recipient', 'recipient', 'client', 'purpose of use', 'payment reference', 'zahlungsempfänger', 'empfänger', 'auftraggeber', 'verwendungszweck', 'zahlungsreferenz'];
const LABEL_RE = new RegExp(`(${[...LABELS].sort((a, b) => b.length - a.length).map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}):`, 'g');

/**
 * Entfernt technischen Ballast (IBAN, BIC, Mandat, Kartenfolgenummer …) aus Textfeldern, die Banken als
 * "Label: Wert Label: Wert" liefern, und behält Empfänger/Auftraggeber/Verwendungszweck.
 */
export function cleanBankText(text: string): string {
  const matches = [...text.matchAll(LABEL_RE)];
  if (matches.length === 0) return text.replace(/\s+/g, ' ').trim();
  const parts: { label: string; value: string }[] = [];
  const head = text.slice(0, matches[0].index).trim();
  matches.forEach((m, i) => {
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    parts.push({ label: m[1].toLowerCase(), value: text.slice(start, end).replace(/\s+/g, ' ').trim() });
  });
  const kept: string[] = [];
  const add = (v: string) => { if (v && !kept.some((k) => k.toLowerCase().includes(v.toLowerCase()))) kept.push(v); };
  if (head) add(head);
  for (const l of KEEP) for (const p of parts) if (p.label === l) add(p.value);
  return kept.length ? kept.join(' – ') : text.replace(/\s+/g, ' ').trim();
}

export function detectMapping(header: string[]): Mapping {
  const date = findCol(header, DATE_KEYS);
  const amount = findCol(header, AMOUNT_KEYS);
  const debit = amount === null ? findCol(header, DEBIT_KEYS) : null;
  const credit = amount === null ? findCol(header, CREDIT_KEYS) : null;
  const text: number[] = [];
  const partner = findCol(header, PARTNER_KEYS);
  if (partner !== null) text.push(partner);
  const t = header.findIndex((h, i) => !text.includes(i) && TEXT_KEYS.some((k) => norm(h).includes(k)));
  if (t >= 0) text.push(t);
  return { date, amount, debit, credit, text, invert: false };
}

export interface Candidate {
  /** Zeilennummer in der Datei (1-basiert) */
  row: number;
  date: ISODate;
  description: string;
  amountCents: number; // immer positiv
  type: EntryType;
  category: string;
  duplicate: boolean;
  /** Passt zu einem Fixposten (würde doppelt zählen) */
  fixMatch: boolean;
  /** Sieht nach Umbuchung/Ausgleich aus (eigenes Konto, Revolut, Partner) */
  transfer: boolean;
  selected: boolean;
}

export interface BuildContext {
  existing: Entry[];
  recurring: Recurring[];
  categories: string[];
  learned?: Record<string, string>;
  /** Zeilen, deren Text einen dieser Begriffe enthält, gelten als Umbuchung/Ausgleich */
  ignoreTerms?: string[];
}

const TRANSFER_RE = /(umbuchung|eigen(?:er)?\s?(?:über|ueber)trag|revolut|wise\b|(?:über|ueber)trag auf (?:eigenes )?konto)/i;

export interface BuildResult {
  candidates: Candidate[];
  skipped: number;
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function buildCandidates(rows: string[][], headerRow: number, map: Mapping, ctx: BuildContext): BuildResult {
  const counts = new Map<string, number>();
  for (const e of ctx.existing) {
    const k = `${e.date}|${e.type}|${e.amountCents}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const candidates: Candidate[] = [];
  let skipped = 0;
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = map.date === null ? null : parseBankDate(r[map.date] ?? '');
    let signed: number | null = null;
    if (map.amount !== null) signed = parseBankAmount(r[map.amount] ?? '');
    else if (map.debit !== null || map.credit !== null) {
      const d = map.debit !== null ? parseBankAmount(r[map.debit] ?? '') : null;
      const c = map.credit !== null ? parseBankAmount(r[map.credit] ?? '') : null;
      if (d !== null || c !== null) signed = (c !== null ? Math.abs(c) : 0) - (d !== null ? Math.abs(d) : 0);
    }
    if (!date || signed === null || signed === 0) { skipped++; continue; }
    if (map.invert) signed = -signed;
    const type: EntryType = signed > 0 ? 'income' : 'expense';
    const amountCents = Math.abs(signed);
    const parts: string[] = [];
    for (const c of map.text) {
      const v = cleanBankText(cleanText(r[c] ?? ''));
      if (v && !parts.some((p) => p.toLowerCase().includes(v.toLowerCase()))) parts.push(v);
    }
    let description = parts.join(' – ');
    if (description.length > 90) description = description.slice(0, 89) + '…';
    const key = `${date}|${type}|${amountCents}`;
    const left = counts.get(key) ?? 0;
    const duplicate = left > 0;
    if (duplicate) counts.set(key, left - 1);
    const ym = ymOf(date);
    const fixMatch = ctx.recurring.some((f) => f.type === type && isActive(f, ym) && (monthlyCents(f) === amountCents || f.amountCents === amountCents));
    let cat = guessCategory(description.toLowerCase(), ctx.categories, ctx.learned);
    if (type === 'income' ? cat !== 'Gehalt' : cat === 'Gehalt') cat = '';
    const low = description.toLowerCase();
    const transfer = TRANSFER_RE.test(description) || (ctx.ignoreTerms ?? []).some((t) => t.trim() !== '' && low.includes(t.trim().toLowerCase()));
    candidates.push({
      row: i + 1, date, description, amountCents, type,
      category: cat || (type === 'income' ? 'Sonstige Einnahmen' : 'Sonstiges'),
      duplicate, fixMatch, transfer, selected: !duplicate && !fixMatch && !transfer,
    });
  }
  return { candidates, skipped };
}
