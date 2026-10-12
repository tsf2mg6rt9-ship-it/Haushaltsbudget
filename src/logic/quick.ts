import { addDays, fromISO, toISO } from './dates';
import { parseMoney } from './money';
import { matchRule } from './rules';
import { normalizeTags } from './tags';
import type { CategoryRule, EntryType, ISODate, PersonIdx } from './types';

export interface QuickContext {
  today: ISODate;
  names: [string, string];
  categories: string[];
  /** Gelernte Zuordnung Händler (klein) -> Kategorie aus früheren Buchungen */
  learned?: Record<string, string>;
  /** Feste Händler-Regeln (haben Vorrang) */
  rules?: CategoryRule[];
}

export interface QuickResult {
  amountCents: number | null;
  date: ISODate;
  description: string;
  category: string;
  type: EntryType;
  share1Pct: number;
  paidBy: PersonIdx;
  /** Hashtags aus der Eingabe (#Urlaub oder "Hashtag Urlaub") */
  tags: string[];
  /** Was erkannt wurde (für die Vorschau) */
  recognized: { amount: boolean; date: boolean; split: boolean; payer: boolean; category: boolean };
}

const WEEKDAYS: Record<string, number> = {
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
};

const CATEGORY_KEYWORDS: [string, string[]][] = [
  ['Versicherung', ['versicherung', 'polizze', 'uniqa', 'allianz', 'generali', 'wiener städtische', 'donau', 'vav', 'grawe', 'hdi', 'merkur versicherung']],
  ['Abos', ['netflix', 'spotify', 'disney', 'patreon', 'youtube', 'apple.com', 'icloud', 'amazon prime', 'zeitung', 'abo', 'mitgliedschaft', 'membership', 'hutchison', 'drei austria', 'magenta', 'a1 telekom', 'orf beitrag', 'gis', 'internet', 'handy', 'mobilfunk']],
  ['Wohnen', ['miete', 'rent', 'hausverwaltung', 'betriebskosten', 'wien energie', 'illwerke', 'vkw', 'strom', 'gasag', 'fernwärme', 'wasser', 'kanal', 'müllabfuhr']],
  ['Lebensmittel', ['sennerei', 'käserei', 'hofladen', 'bio', 'billa', 'spar', 'hofer', 'merkur', 'lidl', 'penny', 'interspar', 'eurospar', 'bipa', 'dm', 'supermarkt', 'bäckerei', 'baeckerei', 'ströck', 'anker', 'metzger', 'fleischer', 'markt', 'gemüse']],
  ['Restaurant', ['habanero', 'gasthaus', 'gasthof', 'trattoria', 'osteria', 'pizzeria', 'imbiss', 'bistro', 'eis', 'restaurant', 'mcdonalds', "mcdonald's", 'burger', 'pizza', 'kaffee', 'café', 'cafe', 'bar', 'lieferando', 'mjam', 'wirtshaus', 'essen gehen', 'döner', 'kebab', 'sushi']],
  ['Mobilität', ['tanken', 'benzin', 'diesel', 'omv', 'bp', 'shell', 'jet', 'öbb', 'oebb', 'wiener linien', 'taxi', 'uber', 'bolt', 'parken', 'parkschein', 'maut', 'vignette', 'tankstelle']],
  ['Haushalt', ['amazon', 'momax', 'hueber', 'xxxlutz', 'kika', 'leiner', 'pfeiffer', 'ikea', 'obi', 'bauhaus', 'hornbach', 'baumarkt', 'putzmittel', 'möbel', 'moebel']],
  ['Gesundheit', ['farmacia', 'farmacie', 'kosmetik', 'friseur', 'physio', 'apotheke', 'arzt', 'zahnarzt', 'medikament', 'ordination']],
  ['Freizeit', ['airways', 'ryanair', 'easyjet', 'lauda', 'flug', 'airbnb', 'booking.com', 'kino', 'konzert', 'theater', 'museum', 'ticket', 'eintritt', 'urlaub', 'hotel', 'schwimmbad', 'therme']],
  ['Gehalt', ['lohn/gehalt', 'gehalt', 'lohn', 'bezüge']],
  ['Kleidung', ['vinted', 'schuh', 'jimmy fairly', 'zalando', 'about you', 'bershka', 'pull&bear', 'mango', 'h&m', 'zara', 'c&a', 'schuhe', 'kleidung', 'jacke', 'hose']],
];

const FILLER = new Set([
  'am', 'an', 'bei', 'beim', 'im', 'in', 'für', 'fuer', 'von', 'vom', 'und', 'hab', 'habe', 'hat', 'ich', 'bezahlt', 'gezahlt',
  'zahlt', 'euro', 'eur', 'heute', 'gestern', 'vorgestern', 'ausgabe', 'einnahme', 'geteilt', 'jeweils', 'die', 'der', 'das', 'ein', 'eine',
  'mir', 'mich', 'auf', 'zu', 'bei', 'dem', 'den', 'nur', 'alleine', 'allein', 'halbe', 'halbe-halbe', 'prozent', 'bekommen', 'erhalten',
]);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Entfernt den ersten Treffer von `re` aus `text` und gibt (treffer, rest) zurück. */
function take(text: string, re: RegExp): { m: RegExpMatchArray | null; rest: string } {
  const m = text.match(re);
  if (!m) return { m: null, rest: text };
  return { m, rest: text.slice(0, m.index!) + ' ' + text.slice(m.index! + m[0].length) };
}

/** Kategorie aus gelernten Händlern bzw. Schlagwörtern erraten; '' wenn nichts passt. `lower` muss klein geschrieben sein. */
export function guessCategory(lower: string, categories: string[], learned?: Record<string, string>, rules?: CategoryRule[]): string {
  const byRule = matchRule(lower, rules);
  if (byRule) return byRule;
  if (learned) {
    for (const [merchant, cat] of Object.entries(learned)) {
      if (merchant && lower.includes(merchant)) return cat;
    }
  }
  for (const [cat, keys] of CATEGORY_KEYWORDS) {
    if (!categories.includes(cat)) continue;
    if (keys.some((k) => new RegExp(`(^|[^a-zäöüß])${esc(k)}($|[^a-zäöüß])`, 'i').test(lower))) return cat;
  }
  return '';
}

export function parseQuickEntry(input: string, ctx: QuickContext): QuickResult {
  const [n1, n2] = ctx.names.map((n) => n.trim().toLowerCase());
  const today = fromISO(ctx.today);
  let text = ' ' + input.trim().replace(/\s+/g, ' ') + ' ';
  const tags: string[] = [];
  const grab = (_: string, t: string) => { tags.push(t.replace(/-/g, ' ')); return ' '; };
  text = text.replace(/#([\wäöüÄÖÜß-]+)/g, grab).replace(/\bhashtag\s+([\wäöüÄÖÜß-]+)/gi, grab);
  const rec = { amount: false, date: false, split: false, payer: false, category: false };

  // ---- Datum ----
  let date = ctx.today;
  let r = take(text, /\b(\d{1,2})\.\s?(\d{1,2})\.(?:(\d{4}|\d{2})(?![\d,]))?(?!\d)/);
  if (r.m) {
    const day = +r.m[1];
    const month = +r.m[2];
    let year = today.getFullYear();
    if (r.m[3]) year = r.m[3].length === 2 ? 2000 + +r.m[3] : +r.m[3];
    const d = new Date(year, month - 1, day);
    if (d.getMonth() === month - 1 && d.getDate() === day) {
      // Ohne Jahr und in der Zukunft -> letztes Jahr (Buchungen liegen meist in der Vergangenheit)
      if (!r.m[3] && d.getTime() > today.getTime()) d.setFullYear(year - 1);
      date = toISO(d);
      rec.date = true;
      text = r.rest;
    }
  }
  if (!rec.date) {
    r = take(text, /\bvorgestern\b/i);
    if (r.m) { date = toISO(addDays(today, -2)); rec.date = true; text = r.rest; }
  }
  if (!rec.date) {
    r = take(text, /\bgestern\b/i);
    if (r.m) { date = toISO(addDays(today, -1)); rec.date = true; text = r.rest; }
  }
  if (!rec.date) {
    r = take(text, /\bheute\b/i);
    if (r.m) { rec.date = true; text = r.rest; }
  }
  if (!rec.date) {
    r = take(text, /\b(?:(?:am|letzten|letzter|vergangenen)\s+)*(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/i);
    if (r.m) {
      const target = WEEKDAYS[r.m[1].toLowerCase()];
      let diff = (today.getDay() - target + 7) % 7;
      if (diff === 0) diff = 0; // heute, falls heute der genannte Wochentag ist
      date = toISO(addDays(today, -diff));
      rec.date = true;
      text = r.rest;
    }
  }

  // ---- Aufteilung (eindeutige Schlagwörter zuerst, damit "50/50" nicht als Betrag gilt) ----
  let share1Pct = 50;
  const set = (pct: number, rest: string) => { share1Pct = pct; rec.split = true; text = rest; };
  r = take(text, /\b(halbe[\s-]?halbe|50\s*[/:]\s*50|fifty[\s-]?fifty|geteilt|hälfte|haelfte|gleichmäßig|zu gleichen teilen)\b/i);
  if (r.m) set(50, r.rest);

  // ---- Betrag ----
  let amountCents: number | null = null;
  // "54 Euro 20" / "54 euro und 20 cent"
  r = take(text, /(\d+)\s*(?:euro|eur|€)\s*(?:und\s*)?(\d{1,2})(?![\d/:%]|[.,]\d|\s*prozent)(?:\s*cent)?/i);
  if (r.m) {
    amountCents = +r.m[1] * 100 + +(r.m[2].padEnd(2, '0'));
    text = r.rest;
  } else {
    // bevorzugt Zahl mit Währung, sonst erste Zahl
    r = take(text, /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)\s*(?:€|euro\b|eur\b)/i);
    if (!r.m) r = take(text, /(?:€)\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)/i);
    if (!r.m) r = take(text, /(?<![\d.,%/])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)(?![\d,.]*\s*(?:%|prozent))(?!\d)/i);
    if (r.m) {
      amountCents = parseMoney(r.m[1]);
      text = r.rest;
    }
  }
  rec.amount = amountCents !== null;

  // ---- Typ ----
  let type: EntryType = 'expense';
  r = take(text, /\b(einnahme|gehalt|lohn|gutschrift|rückerstattung|rueckerstattung|bekommen|erhalten|rückzahlung)\b/i);
  if (r.m) { type = 'income'; /* Wort bleibt als Beschreibung erhalten, wenn es sinnvoll ist */ }

  // ---- Aufteilung ----
  if (!rec.split) {
    // "60 Prozent ich" / "70% Freund" / "ich 60%"
    const pm = text.match(/(?:(\S+)\s+)?(\d{1,3})\s*(?:%|prozent)(?:\s+(\S+))?/i);
    if (pm) {
      const pct = Math.min(100, +pm[2]);
      const before = (pm[1] ?? '').toLowerCase().replace(/[^a-zäöüß]/g, '');
      const after = (pm[3] ?? '').toLowerCase().replace(/[^a-zäöüß]/g, '');
      const isP2 = after === n2 || before === n2;
      const isP1 = after === 'ich' || before === 'ich' || after === n1 || before === n1;
      const rest = text.replace(pm[0], ' ');
      if (isP2 && !isP1) set(100 - pct, rest);
      else set(pct, rest);
    }
  }
  if (!rec.split) {
    r = take(text, new RegExp(`\\bnur\\s+(ich|${esc(n2)}|${esc(n1)})\\b`, 'i'));
    if (r.m) {
      const who = r.m[1].toLowerCase();
      set(who === n2 ? 0 : 100, r.rest);
    }
  }
  if (!rec.split) {
    r = take(text, new RegExp(`\\b(für\\s+mich(?:\\s+allein)?|alleine?\\s+ich|für\\s+${esc(n2)}\\s+allein|für\\s+${esc(n2)}|allein\\s+${esc(n2)}|persönlich)\\b`, 'i'));
    if (r.m) {
      const t = r.m[1].toLowerCase();
      set(t.includes(n2) ? 0 : 100, r.rest);
    }
  }

  // ---- Bezahlt von ----
  let paidBy: PersonIdx = 0;
  const p2 = esc(n2);
  r = take(text, new RegExp(`\\b(?:${p2}\\s+(?:hat|hatte)\\s+(?:es\\s+)?(?:bezahlt|gezahlt|vorgestreckt)|bezahlt\\s+(?:von|durch)\\s+${p2}|von\\s+${p2}\\s+bezahlt|${p2}\\s+zahlt)\\b`, 'i'));
  if (r.m) { paidBy = 1; rec.payer = true; text = r.rest; }
  if (!rec.payer) {
    r = take(text, /\b(?:ich\s+(?:hab|habe|hatte)\s+(?:es\s+|das\s+)?(?:bezahlt|gezahlt|vorgestreckt)|bezahlt\s+(?:von|durch)\s+(?:mir|ich)|von\s+mir\s+bezahlt|ich\s+zahle?)\b/i);
    if (r.m) { paidBy = 0; rec.payer = true; text = r.rest; }
  }
  if (!rec.payer) {
    // "... bezahlt <Name>" / "... bezahlt hat <Name>"
    r = take(text, new RegExp(`\\b(?:hat\\s+)?(?:bezahlt|gezahlt)\\s+(?:hat\\s+)?${p2}\\b`, 'i'));
    if (r.m) { paidBy = 1; rec.payer = true; text = r.rest; }
  }
  if (type === 'income' && !rec.payer) {
    // Bei Einnahmen: "für Freund" o. ä. -> Empfänger
    const m = text.match(new RegExp(`\\b${p2}\\b`, 'i'));
    if (m) { paidBy = 1; rec.payer = true; text = text.replace(m[0], ' '); }
  }

  // ---- Beschreibung & Kategorie ----
  const words = text
    .replace(/[,;:!?()€]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !FILLER.has(w.toLowerCase()) && w.toLowerCase() !== n2 && w.toLowerCase() !== n1);
  const description = capitalize(words.join(' ').trim());

  const lower = description.toLowerCase();
  let category = guessCategory(lower, ctx.categories, ctx.learned, ctx.rules);
  rec.category = category !== '';
  if (!category) category = type === 'income' ? 'Sonstige Einnahmen' : 'Sonstiges';

  return { amountCents, date, description, category, type, share1Pct, paidBy, tags: normalizeTags(tags), recognized: rec };
}
