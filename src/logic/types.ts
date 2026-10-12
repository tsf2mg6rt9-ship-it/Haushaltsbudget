/** Alle Beträge sind ganzzahlige Cent-Werte, um Rundungsfehler zu vermeiden. */
export type PersonIdx = 0 | 1;
export type EntryType = 'expense' | 'income';
export type Rhythm = 'monthly' | 'quarterly' | 'yearly';
/** Monat im Format "YYYY-MM" */
export type YM = string;
/** Datum im Format "YYYY-MM-DD" */
export type ISODate = string;

export interface UmbauInfo {
  /** Gewerk bzw. Firma, z. B. "Elektriker" */
  trade: string;
  invoiceNo?: string;
  /** false = Rechnung ist noch offen */
  paid: boolean;
}

export interface Entry {
  id: string;
  date: ISODate;
  description: string;
  category: string;
  amountCents: number;
  type: EntryType;
  /** Anteil Person 1 in Prozent (0–100); Rest trägt Person 2. Bei Einnahmen ohne Bedeutung. */
  share1Pct: number;
  /** Bei Ausgaben: wer hat bezahlt. Bei Einnahmen: wer hat das Geld erhalten. */
  paidBy: PersonIdx;
  umbau?: UmbauInfo;
  note?: string;
  /** Freie Schlagwörter, z. B. "Urlaub Frankreich" oder "Geburtstag" */
  tags?: string[];
}

export interface Recurring {
  id: string;
  label: string;
  category: string;
  type: EntryType;
  /** Betrag pro Zahlung (je nach Rhythmus). */
  amountCents: number;
  rhythm: Rhythm;
  share1Pct: number;
  paidBy: PersonIdx;
  from?: YM;
  to?: YM;
}

export interface LoanSettings {
  /** Sollzins p. a. in Prozent */
  ratePct: number;
  years: number;
  /** Sicherheitspuffer in % der Einnahmen, der nie für die Rate verplant wird */
  bufferPct: number;
  /** Wunsch-Kreditsumme (optional) */
  wishCents: number | null;
  /** Bezugsmonat für die Berechnung; null = nächster Monat */
  refYM: YM | null;
  /** Wer zahlt die Rate: beide gemeinsam oder eine Person allein (Trennungs-Szenario) */
  scenario: 'both' | 'p0' | 'p1';
  /** Solo-Szenario: Fixkosten mit vollem Betrag (Wohnung allein) statt nur dem bisherigen Anteil */
  soloFullFixed: boolean;
  /** Solo-Szenario: variable Ausgaben in % der gemeinsamen Schätzung */
  soloVariablePct: number;
}

export interface Settings {
  names: [string, string];
  categories: string[];
  umbauBudgetCents: number;
  /** Kontostand/Ersparnisse zum Planungsstart (optional). */
  startBalanceCents: number;
  /** Manuelle Schätzung variabler Ausgaben pro Monat für die Planung; null = Durchschnitt. */
  variableEstimateCents: number | null;
  loan: LoanSettings;
  /** Tags, die neue Buchungen automatisch bekommen (z. B. während eines Urlaubs) */
  activeTags: string[];
  /** Begriffe (z. B. Name des Partners), deren Kontoauszugszeilen beim Import als Ausgleich/Umbuchung gelten und abgewählt werden */
  importIgnoreTerms: string[];
  lastBackupAt: string | null;
  installHintDismissed: boolean;
}

export interface BackupFile {
  app: 'haushaltsbudget';
  version: 1;
  exportedAt: string;
  settings: Settings;
  entries: Entry[];
  recurring: Recurring[];
}

export interface Line {
  key: string;
  source: 'entry' | 'recurring';
  id: string;
  date: ISODate | null;
  description: string;
  category: string;
  type: EntryType;
  amountCents: number;
  share1Pct: number;
  paidBy: PersonIdx;
  umbau?: UmbauInfo;
  tags?: string[];
}

export interface Settlement {
  /** Wer überweist (null, wenn nichts auszugleichen ist) */
  from: PersonIdx | null;
  to: PersonIdx | null;
  amountCents: number;
}

export interface MonthSummary {
  ym: YM;
  lines: Line[];
  income: [number, number];
  /** Anteil der Ausgaben, den jede Person tragen muss */
  expenseShare: [number, number];
  /** Was jede Person tatsächlich vorgestreckt hat */
  paid: [number, number];
  totalExpense: number;
  totalIncome: number;
  /** Einnahmen minus eigene Ausgabenanteile, vor Ausgleichszahlung */
  net: [number, number];
  /** Nach Ausgleich: Einnahmen minus eigene Ausgabenanteile (identisch zu net – Ausgleich ist kein Einkommen) */
  settlement: Settlement;
  byCategory: { category: string; cents: number }[];
}
