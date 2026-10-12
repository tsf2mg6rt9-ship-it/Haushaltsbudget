import { monthlyCents } from '../logic/calc';
import { monthLabel } from '../logic/dates';
import type { Recurring, Settings } from '../logic/types';
import { money } from './ui';

const MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const RH = { monthly: 'monatlich', quarterly: 'quartalsweise', yearly: 'jährlich' };

function List({ items, settings, onEdit }: { items: Recurring[]; settings: Settings; onEdit: (r: Recurring) => void }) {
  if (items.length === 0) return <p class="muted">Noch nichts angelegt.</p>;
  return (
    <ul class="list">
      {items.map((r) => (
        <li key={r.id}>
          <button class="item" onClick={() => onEdit(r)}>
            <span class="main">
              <span class="title">{r.label}</span>
              <span class="sub">
                {r.category} · {r.type === 'expense' ? `${settings.names[r.paidBy]} zahlt · ${r.share1Pct === 50 ? '50/50' : `${r.share1Pct}/${100 - r.share1Pct}`}` : `für ${settings.names[r.paidBy]}`}
                {r.rhythm !== 'monthly' && ` · ${money(r.amountCents)} ${RH[r.rhythm]}${r.dueMonth ? `, abgebucht im ${r.rhythm === 'yearly' ? MONTHS[r.dueMonth - 1] : `${MONTHS[r.dueMonth - 1]} (alle 3 Monate)`}` : ''}`}
                {(r.from || r.to) && ` · ${r.from ? `ab ${monthLabel(r.from)}` : ''}${r.from && r.to ? ' ' : ''}${r.to ? `bis ${monthLabel(r.to)}` : ''}`}
              </span>
            </span>
            <span class="amt">{money(monthlyCents(r))}<small>/Mon.</small></span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function FixView({ recurring, settings, onEdit, onNew }: { recurring: Recurring[]; settings: Settings; onEdit: (r: Recurring) => void; onNew: (type: 'expense' | 'income') => void }) {
  const exp = recurring.filter((r) => r.type === 'expense');
  const inc = recurring.filter((r) => r.type === 'income');
  const sum = (xs: Recurring[]) => xs.reduce((s, r) => s + monthlyCents(r), 0);
  return (
    <section>
      <h1>Fix</h1>
      <p class="muted">Fixposten werden einmal angelegt und in jedem gültigen Monat automatisch berechnet – nicht kopiert. Jahres- und Quartalsbeträge rechnet die App selbst auf Monate um.</p>
      <div class="card">
        <div class="lbl">Fixkosten · {money(sum(exp))} / Monat</div>
        <List items={exp} settings={settings} onEdit={onEdit} />
        <button class="wide" onClick={() => onNew('expense')}>＋ Fixkost</button>
      </div>
      <div class="card">
        <div class="lbl">Feste Einnahmen · {money(sum(inc))} / Monat</div>
        <List items={inc} settings={settings} onEdit={onEdit} />
        <button class="wide" onClick={() => onNew('income')}>＋ Feste Einnahme</button>
      </div>
    </section>
  );
}
