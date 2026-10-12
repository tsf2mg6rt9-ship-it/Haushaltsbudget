import { useState } from 'preact/hooks';
import { monthLabel, ymOf } from '../logic/dates';
import { centsToInput, parseMoney } from '../logic/money';
import { averageVariable, buildPlan } from '../logic/planning';
import type { Entry, Recurring, Settings } from '../logic/types';
import { saveSettings } from '../store';
import { LoanView } from './LoanView';
import { money, Seg } from './ui';

export function PlanView({ entries, recurring, settings }: { entries: Entry[]; recurring: Recurring[]; settings: Settings }) {
  const now = ymOf(new Date());
  const avg = averageVariable(entries, now);
  const estimate = settings.variableEstimateCents ?? avg;
  const [start, setStart] = useState(settings.startBalanceCents ? centsToInput(settings.startBalanceCents) : '');
  const [est, setEst] = useState(settings.variableEstimateCents !== null ? centsToInput(settings.variableEstimateCents) : '');
  const plan = buildPlan(entries, recurring, now, 13, settings.startBalanceCents, estimate);
  const [mode, setMode] = useState<'plan' | 'loan'>('plan');
  const lowest = Math.min(...plan.map((r) => r.cumulative));

  return (
    <section>
      <h1>Planung</h1>
      <Seg value={mode} onChange={setMode} options={[{ value: 'plan', label: 'Verlauf 12 Monate' }, { value: 'loan', label: 'Kreditrate' }]} />
      {mode === 'loan' ? <LoanView entries={entries} recurring={recurring} settings={settings} /> : <>
      <p class="muted" style="margin-top:12px">Vorschau der nächsten 12 Monate: Fixkosten und feste Einnahmen werden berechnet, variable Ausgaben geschätzt, Umbau-Rechnungen (auch geplante) kommen aus deinen Einträgen.</p>
      <div class="card">
        <div class="two">
          <label class="field">
            <span class="lbl">Kontostand zu Monatsbeginn (€)</span>
            <input inputMode="decimal" placeholder="0,00" value={start} onInput={(e) => setStart(e.currentTarget.value)}
              onBlur={() => saveSettings({ startBalanceCents: parseMoney(start) ?? 0 })} />
          </label>
          <label class="field">
            <span class="lbl">Variable Ausgaben / Monat (€)</span>
            <input inputMode="decimal" placeholder={`Ø ${centsToInput(avg)}`} value={est} onInput={(e) => setEst(e.currentTarget.value)}
              onBlur={() => { const c = parseMoney(est); saveSettings({ variableEstimateCents: c === null ? null : c }); }} />
          </label>
        </div>
        <p class="hint">Leer = Durchschnitt der letzten 3 Monate ({money(avg)}). Der Kontostand (beide Personen zusammen) gilt für den Beginn des aktuellen Monats.</p>
      </div>

      <div class="card scroll">
        <table class="grid plan">
          <thead><tr><th>Monat</th><th>Einnahmen</th><th>Fix</th><th>Variabel</th><th>Umbau</th><th>Saldo</th></tr></thead>
          <tbody>
            {plan.map((r, i) => (
              <tr class={i === 0 ? 'current' : ''}>
                <td>{monthLabel(r.ym)}</td>
                <td class="pos">{money(r.income)}</td>
                <td>{money(r.fixed)}</td>
                <td class={r.variableIsEstimate ? 'muted' : ''}>{r.variableIsEstimate ? '≈ ' : ''}{money(r.variable)}</td>
                <td>{r.umbau ? money(r.umbau) : '–'}</td>
                <td class={r.cumulative < 0 ? 'neg' : ''} title={`Monatsergebnis ${money(r.net)}`}>{money(r.cumulative)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="hint">„Saldo“ = Kontostand am Monatsende, kumuliert. Niedrigster Stand: <strong class={lowest < 0 ? 'neg' : ''}>{money(lowest)}</strong>. Der laufende Monat zeigt nur bereits Gebuchtes.</p>
      </div>
      </>}
    </section>
  );
}
