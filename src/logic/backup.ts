import { isValidISO, isValidYM } from './dates';
import { normalizeTags } from './tags';
import type { BackupFile, CategoryRule, Entry, LoanSettings, Recurring, Settings } from './types';

export const DEFAULT_CATEGORIES = [
  'Wohnen', 'Lebensmittel', 'Restaurant', 'Mobilität', 'Versicherung', 'Abos', 'Freizeit', 'Gesundheit',
  'Kleidung', 'Haushalt', 'Umbau', 'Sonstiges', 'Gehalt', 'Sonstige Einnahmen',
];

export const DEFAULT_LOAN: LoanSettings = { ratePct: 4, years: 25, bufferPct: 10, wishCents: null, refYM: null, scenario: 'both', soloFullFixed: true, soloVariablePct: 60 };

export const DEFAULT_SETTINGS: Settings = {
  names: ['Ich', 'Freund'],
  categories: DEFAULT_CATEGORIES,
  umbauBudgetCents: 0,
  startBalanceCents: 0,
  variableEstimateCents: null,
  loan: DEFAULT_LOAN,
  importIgnoreTerms: [],
  categoryRules: [],
  activeTags: [],
  lastBackupAt: null,
  installHintDismissed: false,
};

export function makeBackup(settings: Settings, entries: Entry[], recurring: Recurring[], now = new Date()): BackupFile {
  return { app: 'haushaltsbudget', version: 1, exportedAt: now.toISOString(), settings, entries, recurring };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
const pct = (v: unknown): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 50;
  return Math.min(100, Math.max(0, n));
};
const person = (v: unknown): 0 | 1 => (v === 1 ? 1 : 0);

function cleanLoan(v: unknown): LoanSettings {
  if (!isObj(v)) return DEFAULT_LOAN;
  const num = (x: unknown, d: number, lo: number, hi: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
  return {
    ratePct: num(v.ratePct, DEFAULT_LOAN.ratePct, 0, 30),
    years: Math.round(num(v.years, DEFAULT_LOAN.years, 1, 50)),
    bufferPct: num(v.bufferPct, DEFAULT_LOAN.bufferPct, 0, 100),
    wishCents: int(v.wishCents),
    refYM: typeof v.refYM === 'string' && isValidYM(v.refYM) ? v.refYM : null,
    scenario: v.scenario === 'p0' || v.scenario === 'p1' ? v.scenario : 'both',
    soloFullFixed: v.soloFullFixed !== false,
    soloVariablePct: num(v.soloVariablePct, DEFAULT_LOAN.soloVariablePct, 0, 200),
  };
}

function cleanRules(v: unknown): CategoryRule[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((r) => (isObj(r) && typeof r.match === 'string' && r.match.trim() && typeof r.category === 'string' && r.category.trim() ? [{ match: r.match.trim(), category: r.category.trim() }] : []));
}

function cleanEntry(v: unknown): Entry | null {
  if (!isObj(v)) return null;
  const amountCents = int(v.amountCents);
  const date = str(v.date);
  const id = str(v.id);
  if (amountCents === null || !isValidISO(date) || !id) return null;
  const e: Entry = {
    id, date, amountCents,
    description: str(v.description),
    category: str(v.category, 'Sonstiges'),
    type: v.type === 'income' ? 'income' : v.type === 'settlement' ? 'settlement' : 'expense',
    share1Pct: pct(v.share1Pct),
    paidBy: person(v.paidBy),
  };
  if (isObj(v.umbau)) {
    e.umbau = { trade: str(v.umbau.trade), invoiceNo: str(v.umbau.invoiceNo) || undefined, paid: v.umbau.paid !== false };
  }
  if (typeof v.note === 'string' && v.note) e.note = v.note;
  if (v.checked === true) e.checked = true;
  if (Array.isArray(v.tags)) {
    const tags = normalizeTags(v.tags.filter((t): t is string => typeof t === 'string'));
    if (tags.length) e.tags = tags;
  }
  return e;
}

function cleanRecurring(v: unknown): Recurring | null {
  if (!isObj(v)) return null;
  const amountCents = int(v.amountCents);
  const id = str(v.id);
  if (amountCents === null || !id) return null;
  const rhythm = v.rhythm === 'quarterly' || v.rhythm === 'yearly' ? v.rhythm : 'monthly';
  const r: Recurring = {
    id, amountCents, rhythm,
    label: str(v.label),
    category: str(v.category, 'Sonstiges'),
    type: v.type === 'income' ? 'income' : 'expense',
    share1Pct: pct(v.share1Pct),
    paidBy: person(v.paidBy),
  };
  if (typeof v.from === 'string' && isValidYM(v.from)) r.from = v.from;
  if (typeof v.to === 'string' && isValidYM(v.to)) r.to = v.to;
  return r;
}

export type ParseResult = { ok: true; data: BackupFile; skipped: number } | { ok: false; error: string };

/** Validiert und bereinigt ein Backup. Fehlerhafte Einzeleinträge werden übersprungen und gezählt. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Die Datei ist kein gültiges JSON.' };
  }
  if (!isObj(raw) || raw.app !== 'haushaltsbudget') return { ok: false, error: 'Das ist keine Backup-Datei dieser App.' };
  if (raw.version !== 1) return { ok: false, error: 'Unbekannte Backup-Version.' };
  if (!Array.isArray(raw.entries) || !Array.isArray(raw.recurring) || !isObj(raw.settings)) {
    return { ok: false, error: 'Die Backup-Datei ist unvollständig.' };
  }
  const s = raw.settings;
  const names = Array.isArray(s.names) && s.names.length === 2 ? [str(s.names[0], 'Ich'), str(s.names[1], 'Freund')] : DEFAULT_SETTINGS.names;
  const cats = Array.isArray(s.categories) ? s.categories.filter((c): c is string => typeof c === 'string' && c.trim() !== '') : [];
  const settings: Settings = {
    names: [names[0] || 'Ich', names[1] || 'Freund'],
    categories: cats.length ? cats : DEFAULT_CATEGORIES,
    umbauBudgetCents: int(s.umbauBudgetCents) ?? 0,
    startBalanceCents: int(s.startBalanceCents) ?? 0,
    variableEstimateCents: int(s.variableEstimateCents),
    loan: cleanLoan(s.loan),
    activeTags: Array.isArray(s.activeTags) ? normalizeTags(s.activeTags.filter((t): t is string => typeof t === 'string')) : [],
    categoryRules: cleanRules(s.categoryRules),
    importIgnoreTerms: Array.isArray(s.importIgnoreTerms) ? s.importIgnoreTerms.filter((t): t is string => typeof t === 'string' && t.trim() !== '') : [],
    lastBackupAt: typeof s.lastBackupAt === 'string' ? s.lastBackupAt : null,
    installHintDismissed: s.installHintDismissed === true,
  };
  const entries = raw.entries.map(cleanEntry);
  const recurring = raw.recurring.map(cleanRecurring);
  const skipped = entries.filter((e) => !e).length + recurring.filter((r) => !r).length;
  return {
    ok: true,
    skipped,
    data: {
      app: 'haushaltsbudget', version: 1, exportedAt: str(raw.exportedAt),
      settings,
      entries: entries.filter((e): e is Entry => e !== null),
      recurring: recurring.filter((r): r is Recurring => r !== null),
    },
  };
}

export function backupAgeDays(lastBackupAt: string | null, now = new Date()): number | null {
  if (!lastBackupAt) return null;
  const t = Date.parse(lastBackupAt);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

/** Hinweis nötig? Nur wenn es überhaupt Daten gibt und das letzte Backup (oder fehlendes) > 14 Tage her ist. */
export function backupReminderNeeded(lastBackupAt: string | null, hasData: boolean, now = new Date()): boolean {
  if (!hasData) return false;
  const age = backupAgeDays(lastBackupAt, now);
  return age === null || age > 14;
}
