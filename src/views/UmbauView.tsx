import { useState } from 'preact/hooks';
import { formatDate } from '../logic/dates';
import { centsToInput, parseMoney, splitCents } from '../logic/money';
import type { Entry, Settings } from '../logic/types';
import { saveSettings } from '../store';
import { money } from './ui';

export function UmbauView({ entries, settings, onEdit, onNew }: { entries: Entry[]; settings: Settings; onEdit: (e: Entry) => void; onNew: () => void }) {
  const items = entries.filter((e) => e.umbau && e.type === 'expense').sort((a, b) => (a.date < b.date ? 1 : -1));
  const [budget, setBudget] = useState(settings.umbauBudgetCents ? centsToInput(settings.umbauBudgetCents) : '');
  const names = settings.names;
  const total = items.reduce((s, e) => s + e.amountCents, 0);
  const paid = items.filter((e) => e.umbau!.paid).reduce((s, e) => s + e.amountCents, 0);
  const open = total - paid;
  const share: [number, number] = [0, 0];
  const advanced: [number, number] = [0, 0];
  for (const e of items) {
    const [a, b] = splitCents(e.amountCents, e.share1Pct);
    share[0] += a; share[1] += b;
    advanced[e.paidBy] += e.amountCents;
  }
  const b = settings.umbauBudgetCents;
  const pct = b > 0 ? Math.min(100, (total / b) * 100) : 0;
  const byTrade = new Map<string, { total: number; open: number }>();
  for (const e of items) {
    const k = e.umbau!.trade.trim() || 'Ohne Zuordnung';
    const cur = byTrade.get(k) ?? { total: 0, open: 0 };
    cur.total += e.amountCents;
    if (!e.umbau!.paid) cur.open += e.amountCents;
    byTrade.set(k, cur);
  }
  const trades = [...byTrade.entries()].sort((x, y) => y[1].total - x[1].total);

  return (
    <section>
      <h1>Umbau</h1>
      <div class="card">
        <label class="field">
          <span class="lbl">Gesamtbudget Umbau (€)</span>
          <input inputMode="decimal" placeholder="optional, z. B. 80.000" value={budget}
            onInput={(e) => setBudget(e.currentTarget.value)}
            onBlur={() => { const c = parseMoney(budget); saveSettings({ umbauBudgetCents: c && c > 0 ? c : 0 }); }} />
        </label>
        <table class="grid">
          <tbody>
            <tr><td>Rechnungen gesamt</td><td>{money(total)}</td></tr>
            <tr><td>davon bezahlt</td><td>{money(paid)}</td></tr>
            <tr><td>davon offen / geplant</td><td>{money(open)}</td></tr>
            {b > 0 && <tr class="sum"><td>Rest vom Budget</td><td class={b - total < 0 ? 'neg' : 'pos'}>{money(b - total)}</td></tr>}
          </tbody>
        </table>
        {b > 0 && <div class="bar big-bar" title={`${Math.round(pct)} % des Budgets`}><i class={total > b ? 'over' : ''} style={`width:${pct}%`} /></div>}
      </div>

      <div class="card">
        <div class="lbl">Aufteilung Umbau</div>
        <table class="grid">
          <thead><tr><th></th><th>{names[0]}</th><th>{names[1]}</th></tr></thead>
          <tbody>
            <tr><td>Anteil</td><td>{money(share[0])}</td><td>{money(share[1])}</td></tr>
            <tr><td>Vorgestreckt</td><td>{money(advanced[0])}</td><td>{money(advanced[1])}</td></tr>
          </tbody>
        </table>
        <p class="hint">Umbau-Rechnungen fließen auch in den monatlichen Ausgleich ein (im Tab „Monat“ abschaltbar).</p>
      </div>

      {trades.length > 0 && (
        <div class="card">
          <div class="lbl">Nach Gewerk / Firma</div>
          <table class="grid">
            <tbody>
              {trades.map(([t, v]) => <tr><td>{t}</td><td class="muted">{v.open ? `${money(v.open)} offen` : ''}</td><td>{money(v.total)}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}

      <button class="wide primary" onClick={onNew}>＋ Rechnung erfassen</button>

      <div class="card">
        <div class="lbl">Rechnungen ({items.length})</div>
        {items.length === 0 && <p class="muted">Noch keine Umbau-Rechnungen. Auch geplante, noch nicht bezahlte Posten kannst du mit zukünftigem Datum und „Offen / geplant“ erfassen – sie erscheinen dann in der Planung.</p>}
        <ul class="list">
          {items.map((e) => (
            <li key={e.id}>
              <button class="item" onClick={() => onEdit(e)}>
                <span class="main">
                  <span class="title">{e.umbau!.trade || 'Ohne Zuordnung'}{e.description ? ` – ${e.description}` : ''}</span>
                  <span class="sub">{formatDate(e.date)}{e.umbau!.invoiceNo ? ` · Nr. ${e.umbau!.invoiceNo}` : ''} · {names[e.paidBy]} zahlte · <span class={e.umbau!.paid ? 'tag ok' : 'tag warn'}>{e.umbau!.paid ? 'bezahlt' : 'offen'}</span></span>
                </span>
                <span class="amt">{money(e.amountCents)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
