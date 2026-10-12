/** Parst deutsche/österreichische Zahleneingaben ("1.234,56", "54,2", "54.20", "54") in Cent. */
export function parseMoney(input: string): number | null {
  let s = input.trim().replace(/[€\s]|eur(o)?/gi, '');
  if (!s) return null;
  let neg = false;
  if (s.startsWith('-')) {
    neg = true;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  let intPart: string;
  let frac = '';
  if (s.includes(',')) {
    const i = s.lastIndexOf(',');
    intPart = s.slice(0, i).replace(/\./g, '');
    frac = s.slice(i + 1);
    if (/[.,]/.test(frac) || /,/.test(intPart)) return null;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    intPart = s.replace(/\./g, ''); // 1.234 -> Tausenderpunkt
  } else if (/^\d*\.\d{1,2}$/.test(s)) {
    [intPart, frac] = s.split('.'); // 54.20 -> Dezimalpunkt
  } else if (/^\d+$/.test(s)) {
    intPart = s;
  } else {
    return null;
  }
  if (frac.length > 2) return null;
  if (intPart === '' && frac === '') return null;
  const cents = parseInt(intPart || '0', 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  if (!Number.isFinite(cents)) return null;
  return neg ? -cents : cents;
}

const eur = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });
export function formatMoney(cents: number): string {
  return eur.format(cents / 100);
}

/** Für Eingabefelder: 5420 -> "54,20" */
export function centsToInput(cents: number): string {
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `-${s}` : s;
}

/** Teilt einen Betrag nach Prozentanteil Person 1. Summe ist immer exakt der Betrag. */
export function splitCents(amountCents: number, share1Pct: number): [number, number] {
  const pct = Math.min(100, Math.max(0, share1Pct));
  const s1 = Math.round((amountCents * pct) / 100);
  return [s1, amountCents - s1];
}
