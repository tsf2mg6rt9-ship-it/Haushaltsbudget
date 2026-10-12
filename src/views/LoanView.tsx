import { useState } from 'preact/hooks';
import { addMonths, monthLabel, ymOf } from '../logic/dates';
import { annuityPayment, affordability, principalFromPayment, worstMonth } from '../logic/loan';
import { centsToInput, parseMoney } from '../logic/money';
import { averageVariable } from '../logic/planning';
import type { Entry, LoanSettings, Recurring, Settings } from '../logic/types';
import { saveSettings } from '../store';
import { Seg, money } from './ui';

const YEARS = [10, 15, 20, 25, 30];

export function LoanView({ entries, recurring: allRecurring, settings }: { entries: Entry[]; recurring: Recurring[]; settings: Settings }) {
  const loan = settings.loan;
  const hasPay14 = allRecurring.some((r) => r.pay14);
  // Vorsichtig: 13./14. Gehalt nicht in die leistbare Rate einrechnen
  const recurring = loan.noSpecialPay ? allRecurring.map((r) => (r.pay14 ? { ...r, pay14: undefined } : r)) : allRecurring;
  const names = settings.names;
  const now = ymOf(new Date());
  const next = addMonths(now, 1);
  const ref = loan.refYM ?? next;
  const avg = averageVariable(entries, now);
  const variable = settings.variableEstimateCents ?? avg;

  const [rate, setRate] = useState(centsToInput(Math.round(loan.ratePct * 100)));
  const [years, setYears] = useState(String(loan.years));
  const [buffer, setBuffer] = useState(String(loan.bufferPct));
  const [wish, setWish] = useState(loan.wishCents ? centsToInput(loan.wishCents) : '');
  const [varIn, setVarIn] = useState(settings.variableEstimateCents !== null ? centsToInput(settings.variableEstimateCents) : '');

  const save = (p: Partial<LoanSettings>) => saveSettings({ loan: { ...loan, ...p } });
  const solo = loan.scenario !== 'both';
  const person = loan.scenario === 'p1' ? 1 : 0;
  const sc = { person: solo ? (person as 0 | 1) : null, fullFixed: loan.soloFullFixed };
  const variableUsed = solo ? Math.round((variable * loan.soloVariablePct) / 100) : variable;
  const [soloPct, setSoloPct] = useState(String(loan.soloVariablePct));
  const a = affordability(ref, recurring, variableUsed, loan.bufferPct, sc);
  const worst = worstMonth(next, 12, recurring, variableUsed, loan.bufferPct, sc);
  const months = loan.years * 12;
  const maxPrincipal = principalFromPayment(a.free, loan.ratePct, months);
  const hasIncome = recurring.some((r) => r.type === 'income');
  const share0 = a.income > 0 ? Math.round((a.free * recurring.filter((r) => r.type === 'income' && r.paidBy === 0).reduce((s, r) => s + r.amountCents, 0)) / (a.income || 1)) : 0;
  const wishCents = loan.wishCents ?? 0;
  const wishPay = annuityPayment(wishCents, loan.ratePct, months);
  const rates = [Math.max(0, loan.ratePct - 1), loan.ratePct, loan.ratePct + 1];

  return (
    <>
      {!hasIncome && <div class="banner" role="note"><span>Lege zuerst im Tab „Fix“ eure festen Einnahmen und Fixkosten an – darauf basiert die Rechnung.</span></div>}

      <div class="card">
        <div class="lbl">Wer zahlt die Rate?</div>
        <Seg value={loan.scenario} onChange={(v) => save({ scenario: v })}
          options={[{ value: 'both', label: 'Gemeinsam' }, { value: 'p0', label: `Nur ${names[0]}` }, { value: 'p1', label: `Nur ${names[1]}` }]} />
        {solo && (
          <>
            <div class="lbl" style="margin-top:12px">Fixkosten, wenn {names[person]} allein ist</div>
            <Seg value={loan.soloFullFixed ? 'full' : 'share'} onChange={(v) => save({ soloFullFixed: v === 'full' })}
              options={[{ value: 'full', label: 'Voller Betrag (Wohnung allein)' }, { value: 'share', label: 'Nur bisheriger Anteil' }]} />
            <label class="field">
              <span class="lbl">Variable Ausgaben in % der gemeinsamen Schätzung</span>
              <input inputMode="numeric" value={soloPct} onInput={(e) => setSoloPct(e.currentTarget.value)}
                onBlur={() => { const n = parseInt(soloPct, 10); if (n >= 0 && n <= 200) save({ soloVariablePct: n }); else setSoloPct(String(loan.soloVariablePct)); }} />
              <span class="hint">Allein fällt meist mehr als die Hälfte an – Fixkosten wie Miete, Strom oder Internet werden nicht halbiert. Der volle Betrag ist die vorsichtige Annahme, „nur bisheriger Anteil“ gilt nur, wenn die Kosten wirklich wieder gesplittet würden.</span>
            </label>
            <p class="hint">Hinweis: Wer bei einer Trennung die Rate tragen muss, hängt vom Kreditvertrag ab (oft haften beide). Das solltest du mit der Bank oder rechtlich klären – die App rechnet nur die Zahlen.</p>
          </>
        )}
      </div>

      <div class="card">
        <div class="lbl">Monatsbilanz im Bezugsmonat{solo ? ` · nur ${names[person]}` : ''}</div>
        <label class="field">
          <span class="lbl">Bezugsmonat</span>
          <input type="month" value={ref} onInput={(e) => e.currentTarget.value && save({ refYM: e.currentTarget.value })} />
          <span class="hint">Fixposten mit „ab/bis“ werden berücksichtigt – wähle den Monat, in dem die Rate erstmals fällig wird (z. B. wenn die neue Miete/Strom/Wasser schon gilt).</span>
        </label>
        <table class="grid">
          <tbody>
            <tr><td>Einnahmen</td><td class="pos">{money(a.income)}</td></tr>
            <tr><td>− Fixkosten</td><td>{money(a.fixed)}</td></tr>
            <tr><td>− Variable Ausgaben{solo ? ` (${loan.soloVariablePct} %)` : ' (Schätzung)'}</td><td>{money(a.variable)}</td></tr>
            <tr><td>− Sicherheitspuffer ({loan.bufferPct} %)</td><td>{money(a.buffer)}</td></tr>
            <tr class="sum"><td>= Möglich für Kreditrate</td><td class={a.freeRaw < 0 ? 'neg' : 'pos'}>{money(a.freeRaw)}</td></tr>
          </tbody>
        </table>
        {hasPay14 && (
          <label class="check"><input type="checkbox" checked={loan.noSpecialPay} onChange={(e) => save({ noSpecialPay: e.currentTarget.checked })} /> 13./14. Gehalt nicht einrechnen (vorsichtig, nur 12 Gehälter)</label>
        )}
        <div class="two">
          <label class="field">
            <span class="lbl">Variable Ausgaben / Monat (€)</span>
            <input inputMode="decimal" placeholder={`Ø ${centsToInput(avg)}`} value={varIn} onInput={(e) => setVarIn(e.currentTarget.value)}
              onBlur={() => saveSettings({ variableEstimateCents: parseMoney(varIn) })} />
          </label>
          <label class="field">
            <span class="lbl">Puffer (% der Einnahmen)</span>
            <input inputMode="decimal" value={buffer} onInput={(e) => setBuffer(e.currentTarget.value)}
              onBlur={() => { const c = parseMoney(buffer); save({ bufferPct: c === null ? loan.bufferPct : Math.min(100, c / 100) }); }} />
          </label>
        </div>
        {variable === 0 && <p class="hint">Variable Ausgaben (Essen, Freizeit, Kleidung …) sind noch 0 – das macht die Rate zu optimistisch. Trag eine Schätzung ein oder erfasse ein paar Monate Buchungen.</p>}
        <p class="hint">Strom, Wasser & Co. legst du als Fixposten mit realistischem (eher höherem) Betrag und „ab“-Monat an.</p>
        {worst.ym !== ref && worst.freeRaw < a.freeRaw && (
          <p class="hint">Achtung: In {monthLabel(worst.ym)} ist der freie Betrag mit {money(worst.freeRaw)} niedriger als im Bezugsmonat (geänderte Fixkosten).</p>
        )}
      </div>

      <div class="card highlight">
        <div class="lbl">Leistbare Kreditrate</div>
        <p class="big"><strong>{money(a.free)}</strong> pro Monat</p>
        {a.income > 0 && <p class="hint">Das sind {Math.round((a.free / a.income) * 100)} % der Einnahmen. Banken rechnen als grobe Faustregel oft nur mit etwa einem Drittel bis 40 % des Nettoeinkommens für alle Kreditraten – das ist keine Beratung, bitte mit der Bank prüfen.</p>}
        {!solo && a.income > 0 && a.free > 0 && <p class="hint">Aufteilung nach Einkommen: {names[0]} {money(share0)}, {names[1]} {money(a.free - share0)}.</p>}
      </div>

      <div class="card">
        <div class="lbl">Wie viel Kredit entspricht das?</div>
        <div class="two">
          <label class="field">
            <span class="lbl">Zins p. a. (%)</span>
            <input inputMode="decimal" value={rate} onInput={(e) => setRate(e.currentTarget.value)}
              onBlur={() => { const c = parseMoney(rate); if (c !== null) save({ ratePct: Math.min(30, c / 100) }); }} />
          </label>
          <label class="field">
            <span class="lbl">Laufzeit (Jahre)</span>
            <input inputMode="numeric" value={years} onInput={(e) => setYears(e.currentTarget.value)}
              onBlur={() => { const n = parseInt(years, 10); if (n >= 1 && n <= 50) save({ years: n }); else setYears(String(loan.years)); }} />
          </label>
        </div>
        <p class="big">Kreditsumme bis ca. <strong>{money(maxPrincipal)}</strong></p>
        <table class="grid plan" style="min-width:0">
          <thead><tr><th>Zins \ Jahre</th>{YEARS.map((y) => <th>{y}</th>)}</tr></thead>
          <tbody>
            {rates.map((r) => (
              <tr class={r === loan.ratePct ? 'current' : ''}>
                <td>{String(r).replace('.', ',')} %</td>
                {YEARS.map((y) => <td>{Math.round(principalFromPayment(a.free, r, y * 12) / 100000)} Tsd.</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p class="hint">Tabelle: maximale Kreditsumme in Tausend € bei der leistbaren Rate. Annuitätenkredit mit fixem Zins; Nebenkosten (Gebühren, Versicherung, Variabilität des Zinses) sind nicht enthalten.</p>
      </div>

      <div class="card">
        <div class="lbl">Umgekehrt: Wunschkredit prüfen</div>
        <label class="field">
          <span class="lbl">Kreditsumme (€)</span>
          <input inputMode="decimal" placeholder="z. B. 150.000" value={wish} onInput={(e) => setWish(e.currentTarget.value)}
            onBlur={() => { const c = parseMoney(wish); save({ wishCents: c && c > 0 ? c : null }); }} />
        </label>
        {wishCents > 0 && (
          <table class="grid">
            <tbody>
              <tr><td>Monatliche Rate</td><td><strong>{money(wishPay)}</strong></td></tr>
              <tr><td>Verbleibt nach Rate</td><td class={a.freeRaw - wishPay < 0 ? 'neg' : 'pos'}>{money(a.freeRaw - wishPay)}</td></tr>
              <tr><td>Zinsen gesamt</td><td>{money(wishPay * months - wishCents)}</td></tr>
              <tr class="sum"><td>Leistbar?</td><td class={wishPay <= a.free ? 'pos' : 'neg'}>{wishPay <= a.free ? 'Ja' : `Nein, ${money(wishPay - a.free)} zu viel`}</td></tr>
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
