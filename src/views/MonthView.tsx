import { useState } from 'preact/hooks';
import { addMonths, formatDate, monthLabel, ymOf } from '../logic/dates';
import { todayISO } from '../defaults';
import { closeMonths, cumulativeSettlement, firstDataMonth, monthBalance1, summarizeMonth } from '../logic/calc';
import { saveSettings } from '../store';
import { monthCSV } from '../logic/csv';
import type { Entry, Line, Recurring, Settings } from '../logic/types';
import type { Flag } from '../logic/review';
import { saveFile } from '../files';
import { newSettlement } from '../defaults';
import { CatDot, ColorsCtx, money, SettlementText, TagList } from './ui';
import { colorForCategory } from '../logic/colors';
import { useContext } from 'preact/hooks';

const FLAG_LABEL = { gehalt: 'Gehalt doppelt?', fix: 'Fixposten doppelt?', dublette: 'Dublette?', partner: 'Ausgleich?', umbuchung: 'Umbuchung?' } as const;

export function MonthView({
  ym, setYm, settings, entries, recurring, onEditEntry, onEditRecurring, onNewSettlement, flags,
}: {
  onNewSettlement: (e: Entry) => void;
  flags: Map<string, Flag[]>;
  ym: string;
  setYm: (ym: string) => void;
  settings: Settings;
  entries: Entry[];
  recurring: Recurring[];
  onEditEntry: (e: Entry) => void;
  onEditRecurring: (r: Recurring) => void;
}) {
  const [includeUmbau, setIncludeUmbau] = useState(true);
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const colors = useContext(ColorsCtx);
  const names = settings.names;
  const s = summarizeMonth(ym, entries, recurring, { includeUmbau });
  const closed = settings.closedMonths;
  const isClosed = !!closed[ym];
  const total = cumulativeSettlement(entries, recurring, ym, closed);
  const showTotal = total.amountCents !== s.settlement.amountCents || total.from !== s.settlement.from;
  const shown = catFilter ? s.lines.filter((l) => l.category === catFilter) : s.lines;
  const maxCat = Math.max(1, ...s.byCategory.map((c) => c.cents));
  const hasUmbau = entries.some((e) => e.umbau);

  const open = (l: Line) => {
    if (l.source === 'entry') {
      const e = entries.find((x) => x.id === l.id);
      if (e) onEditEntry(e);
    } else {
      const r = recurring.find((x) => x.id === l.id);
      if (r) onEditRecurring(r);
    }
  };

  return (
    <section>
      <div class="monthnav">
        <button onClick={() => setYm(addMonths(ym, -1))} aria-label="Vorheriger Monat">‹</button>
        <input type="month" value={ym} onInput={(e) => e.currentTarget.value && setYm(e.currentTarget.value)} aria-label="Monat wählen" />
        <button onClick={() => setYm(addMonths(ym, 1))} aria-label="Nächster Monat">›</button>
      </div>
      <h1>{monthLabel(ym)}</h1>

      <div class="card highlight">
        <div class="lbl">Ausgleich</div>
        {isClosed ? (
          <>
            <p class="big">✓ Als ausgeglichen markiert</p>
            {(s.settlement.amountCents > 0 || closed[ym].balance1 !== 0) && (
              <p class="hint">
                Rechnerisch wäre: {s.settlement.from === null ? 'ausgeglichen' : <SettlementText s={s.settlement} names={names} />}
                {monthBalance1(summarizeMonth(ym, entries, recurring)) !== closed[ym].balance1 && ' (bei der Markierung war die Differenz eine andere)'}.
              </p>
            )}
            <p class="hint">Einnahmen, Ausgaben und Anteile bleiben unverändert – nur der offene Ausgleich gilt als erledigt und wird nicht weitergerechnet.</p>
          </>
        ) : (
          <>
            <p class="big"><SettlementText s={s.settlement} names={names} /></p>
            {s.settled[0] + s.settled[1] > 0 && <p class="hint">Bereits überwiesen in diesem Monat: {money(s.settled[0] + s.settled[1])}.</p>}
          </>
        )}
        {showTotal && (
          <p class="hint">Alle offenen Monate bis Ende {monthLabel(ym)} zusammen: {total.from === null || total.to === null ? 'ausgeglichen' : <><strong>{names[total.from]}</strong> schuldet <strong>{names[total.to]}</strong> noch {money(total.amountCents)}</>}.</p>
        )}
        <div class="actions" style="margin-top:8px">
          {isClosed ? (
            <button onClick={() => { const { [ym]: _drop, ...rest } = closed; void _drop; saveSettings({ closedMonths: rest }); }}>Markierung aufheben</button>
          ) : (
            <>
              <button onClick={() => saveSettings({ closedMonths: closeMonths(entries, recurring, ym, ym, closed) })}>✓ Monat als ausgeglichen markieren</button>
              <button onClick={() => {
                const from = firstDataMonth(entries, recurring, ym);
                const next = closeMonths(entries, recurring, from, ym, closed);
                const added = Object.keys(next).length - Object.keys(closed).length;
                if (added > 0 && confirm(`${added} noch offene${added === 1 ? 'n Monat' : ' Monate'} bis ${monthLabel(ym)} als ausgeglichen markieren? Die Zahlen bleiben unverändert, nur der offene Ausgleich gilt als erledigt.`)) saveSettings({ closedMonths: next });
              }}>Alle Monate bis hier</button>
            </>
          )}
          <button onClick={() => onNewSettlement(newSettlement(settings, {
            date: ym === ymOf(new Date()) ? todayISO() : `${ym}-28`,
            paidBy: (total.from ?? s.settlement.from ?? 1) as 0 | 1,
            amountCents: total.amountCents || s.settlement.amountCents,
          }))}>Überweisung erfassen</button>
        </div>
        <p class="hint">Überweisungen zwischen euch zählen nie als Einnahme oder Ausgabe. „Ausgeglichen markieren“ ist für pauschalen Ausgleich (z. B. bar), ohne die Differenz einzeln zu buchen.</p>
      </div>

      <div class="card">
        <table class="grid">
          <thead><tr><th></th><th>{names[0]}</th><th>{names[1]}</th><th>Gesamt</th></tr></thead>
          <tbody>
            <tr><td>Einnahmen</td><td class="pos">{money(s.income[0])}</td><td class="pos">{money(s.income[1])}</td><td>{money(s.totalIncome)}</td></tr>
            <tr><td>Ausgaben</td><td>{money(s.expenseShare[0])}</td><td>{money(s.expenseShare[1])}</td><td>{money(s.totalExpense)}</td></tr>
            <tr class="sum"><td>Übrig</td>
              <td class={s.net[0] < 0 ? 'neg' : ''}>{money(s.net[0])}</td>
              <td class={s.net[1] < 0 ? 'neg' : ''}>{money(s.net[1])}</td>
              <td class={s.totalIncome - s.totalExpense < 0 ? 'neg' : ''}>{money(s.totalIncome - s.totalExpense)}</td></tr>
            <tr class="muted"><td>Vorgestreckt</td><td>{money(s.paid[0])}</td><td>{money(s.paid[1])}</td><td>{money(s.paid[0] + s.paid[1])}</td></tr>
          </tbody>
        </table>
        {hasUmbau && (
          <label class="check"><input type="checkbox" checked={includeUmbau} onChange={(e) => setIncludeUmbau(e.currentTarget.checked)} /> Umbau-Rechnungen einrechnen</label>
        )}
      </div>

      {s.byCategory.length > 0 && (
        <div class="card">
          <div class="lbl">Ausgaben nach Kategorie</div>
          {s.byCategory.map((c) => (
            <button class={`bar-row btn ${catFilter === c.category ? 'sel' : ''}`} aria-pressed={catFilter === c.category}
              onClick={() => setCatFilter(catFilter === c.category ? null : c.category)}>
              <span class="catname"><CatDot category={c.category} />{c.category}</span>
              <div class="bar"><i style={`width:${(c.cents / maxCat) * 100}%;background:${colorForCategory(c.category, colors)}`} /></div>
              <span class="num">{money(c.cents)}</span>
            </button>
          ))}
          <p class="hint">Tippe auf eine Kategorie, um alle zugeordneten Posten zu sehen.</p>
        </div>
      )}

      <div class="card">
        <div class="lbl">Posten im Monat ({shown.length})</div>
        {catFilter && (
          <div class="chips" style="margin-bottom:6px">
            <button class="chip on-chip" onClick={() => setCatFilter(null)}>{catFilter} · {money(s.byCategory.find((c) => c.category === catFilter)?.cents ?? 0)} ✕</button>
          </div>
        )}
        {catFilter && shown.length === 0 && <p class="muted">In diesem Monat gibt es nichts in „{catFilter}“.</p>}
        {s.lines.length === 0 && <p class="muted">Noch nichts eingetragen. Fixkosten legst du im Tab „Fix“ an, Ausgaben über „Buchen“.</p>}
        <ul class="list">
          {shown.map((l) => (
            <li key={l.key}>
              <button class="item" onClick={() => open(l)}>
                <span class="main">
                  <span class="title"><CatDot category={l.category} />{l.type === 'settlement' ? `Ausgleich: ${names[l.paidBy]} → ${names[l.paidBy === 0 ? 1 : 0]}` : l.description || l.umbau?.trade || '–'}</span>
                  <span class="sub">
                    {l.source === 'recurring' ? 'Fix' : l.date ? formatDate(l.date) : ''} · {l.category}
                    {l.type === 'expense' && ` · ${names[l.paidBy]} zahlte · ${l.share1Pct === 50 ? '50/50' : `${l.share1Pct}/${100 - l.share1Pct}`}`}
                    {l.type === 'income' && ` · für ${names[l.paidBy]}`}
                    {l.umbau && !l.umbau.paid && ' · offen'}
                    <TagList tags={l.tags} />
                    {l.source === 'entry' && (flags.get(l.id) ?? []).map((f) => <span class="flagpill" title={f.text}>⚠ {FLAG_LABEL[f.kind]}</span>)}
                  </span>
                </span>
                <span class={l.type === 'income' ? 'amt pos' : 'amt'}>{l.type === 'income' ? '+' : l.type === 'settlement' ? '⇄ ' : '−'}{money(l.amountCents)}</span>
              </button>
            </li>
          ))}
        </ul>
        {s.lines.length > 0 && (
          <button class="link" onClick={() => saveFile(`budget-${ym}.csv`, 'text/csv', monthCSV(ym, s.lines, settings))}>Monat als CSV exportieren (Numbers)</button>
        )}
      </div>
    </section>
  );
}
