import { useContext, useState } from 'preact/hooks';
import { monthLabel, ymOf } from '../logic/dates';
import { buildOverview, categoryDetail, defaultEndYM } from '../logic/overview';
import { formatDate } from '../logic/dates';
import type { Entry, Recurring, Settings } from '../logic/types';
import { tagOverview } from '../logic/tags';
import { CatDot, ColorsCtx, Modal, money, Seg } from './ui';
import { colorForCategory } from '../logic/colors';

type Range = 'all' | '3' | '6' | '12';

export function OverviewView({ entries, recurring, settings, onEditEntry }: { entries: Entry[]; recurring: Recurring[]; settings: Settings; onEditEntry: (e: Entry) => void }) {
  const [range, setRange] = useState<Range>('all');
  const [includeUmbau, setIncludeUmbau] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const colors = useContext(ColorsCtx);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [who, setWho] = useState<'all' | '0' | '1'>('all');
  const allTags = tagOverview(entries);
  const names = settings.names;
  const now = ymOf(new Date());
  const opts = { endYM: defaultEndYM(entries, now), months: range === 'all' ? ('all' as const) : +range, includeUmbau, excludeTags: excluded, startMonth: settings.startMonth, person: who === 'all' ? null : (+who as 0 | 1) };
  const o = buildOverview(entries, recurring, opts);
  const detail = openCat ? categoryDetail(entries, recurring, o, openCat, opts) : null;
  const maxCat = Math.max(1, ...o.byCategory.map((c) => c.total));
  const hasUmbau = entries.some((e) => e.umbau);

  return (
    <>
      <div class="card">
        <div class="lbl">Wessen Zahlen?</div>
        <Seg value={who} onChange={setWho} options={[{ value: 'all', label: 'Gemeinsam' }, { value: '0', label: names[0] }, { value: '1', label: names[1] }]} />
        <p class="hint">{who === 'all' ? 'Alle Einnahmen und Ausgaben beider.' : `Nur ${names[+who]}s Einnahmen und ${names[+who]}s Anteil an den Ausgaben (laut Aufteilung bei jeder Buchung).`}</p>
        <div class="lbl" style="margin-top:12px">Zeitraum</div>
        <Seg value={range} onChange={setRange} options={[{ value: '3', label: '3 Mon.' }, { value: '6', label: '6 Mon.' }, { value: '12', label: '12 Mon.' }, { value: 'all', label: 'Alles' }]} />
        {!o.empty && <p class="hint">Durchschnitt über {o.n} Monat{o.n === 1 ? '' : 'e'} ({monthLabel(o.startYM)} bis {monthLabel(o.endYM)}). Der laufende Monat zählt nur mit, wenn es noch keine älteren Buchungen gibt.</p>}
        {allTags.length > 0 && (
          <div style="margin-top:12px">
            <div class="lbl">Ausnahmen herausrechnen</div>
            <div class="chips">
              {allTags.map((t) => {
                const on = excluded.some((x) => x.toLowerCase() === t.tag.toLowerCase());
                return <button class={`chip ${on ? 'on-chip' : ''}`} aria-pressed={on} onClick={() => setExcluded(on ? excluded.filter((x) => x.toLowerCase() !== t.tag.toLowerCase()) : [...excluded, t.tag])}>{on ? '✕ ' : ''}#{t.tag}</button>;
              })}
            </div>
            <p class="hint">Buchungen mit diesen Tags (z. B. Urlaub, Einmalig) zählen nicht in den Durchschnitt. So siehst du den normalen Alltag.</p>
          </div>
        )}
        {allTags.length === 0 && <p class="hint">Tipp: Markiere einmalige Ausgaben (Urlaub, Anschaffungen) mit einem Tag wie „Einmalig“. Dann kannst du sie hier herausrechnen.</p>}
        {hasUmbau && (
          <label class="check"><input type="checkbox" checked={includeUmbau} onChange={(e) => setIncludeUmbau(e.currentTarget.checked)} /> Umbau-Rechnungen einrechnen</label>
        )}
      </div>

      {o.empty ? (
        <div class="card"><p class="muted">Im gewählten Zeitraum gibt es keine Daten. Wähle „Alles“ oder erfasse Buchungen.</p></div>
      ) : (
        <>
          <div class="tiles">
            <div class="tile"><span class="lbl">Einnahmen Ø/Monat</span><strong class="pos">{money(o.income.avg)}</strong></div>
            <div class="tile"><span class="lbl">Fixkosten Ø/Monat</span><strong>{money(o.fixedExpense.avg)}</strong></div>
            <div class="tile"><span class="lbl">Variable Ausgaben Ø/Monat</span><strong>{money(o.variableExpense.avg)}</strong></div>
            <div class="tile"><span class="lbl">Übrig Ø/Monat</span><strong class={o.netAvg < 0 ? 'neg' : 'pos'}>{money(o.netAvg)}</strong></div>
          </div>
          {o.umbauTotal > 0 && !includeUmbau && <p class="hint" style="margin:-4px 2px 12px">Umbau im Zeitraum: {money(o.umbauTotal)} (nicht eingerechnet).</p>}

          <div class="card">
            <div class="lbl">Wofür geht das Geld drauf? (Ø pro Monat)</div>
            <div class="legend"><span><i class="sw solid" /> fix (kräftig)</span><span><i class="sw light" /> variabel (heller)</span></div>
            {o.byCategory.length === 0 && <p class="muted">Keine Ausgaben.</p>}
            {o.byCategory.map((c) => (
              <button class="bar-row wide-label btn" onClick={() => setOpenCat(c.category)} aria-label={`${c.category} anzeigen`}>
                <span class="catname"><CatDot category={c.category} />{c.category}</span>
                <div class="bar two" style={`color:${colorForCategory(c.category, colors)}`}>
                  <i class="fix" style={`width:${(c.fixedTotal / maxCat) * 100}%`} />
                  <i class="var" style={`width:${(c.variableTotal / maxCat) * 100}%`} />
                </div>
                <span class="num">{money(c.avg)} <small class="muted">{o.expense.total ? Math.round((c.total / o.expense.total) * 100) : 0} %</small></span>
              </button>
            ))}
            <p class="hint">Tippe auf eine Kategorie, um zu sehen, was darin steckt.</p>
            <p class="hint">Essen und Trinken findest du unter „Lebensmittel“ (Einkauf) und „Restaurant“, Freizeit unter „Freizeit“. Kategorien lassen sich unter „Mehr“ anpassen.</p>
          </div>

          <div class="card">
            <div class="lbl">Fixkosten: wiederkehrend jeden Monat</div>
            <table class="grid">
              <tbody>
                {o.fixedItems.filter((f) => f.type === 'expense').map((f) => (
                  <tr><td>{f.label}<br /><small class="muted">{f.category}{f.activeMonths < o.n ? ` · nur ${f.activeMonths} von ${o.n} Monaten` : ''}</small></td><td>{money(f.monthly)}</td></tr>
                ))}
                <tr class="sum"><td>Summe pro Monat</td><td>{money(o.fixedItems.filter((f) => f.type === 'expense').reduce((a, f) => a + f.monthly, 0))}</td></tr>
              </tbody>
            </table>
            {o.fixedItems.some((f) => f.type === 'income') && (
              <>
                <div class="lbl" style="margin-top:14px">Feste Einnahmen</div>
                <table class="grid"><tbody>
                  {o.fixedItems.filter((f) => f.type === 'income').map((f) => <tr><td>{f.label}</td><td class="pos">{money(f.monthly)}</td></tr>)}
                </tbody></table>
              </>
            )}
          </div>

          <div class="card">
            <div class="lbl">Pro Person (Ø pro Monat)</div>
            <table class="grid">
              <thead><tr><th></th><th>{names[0]}</th><th>{names[1]}</th></tr></thead>
              <tbody>
                <tr><td>Einnahmen</td><td class="pos">{money(o.perPerson.income[0])}</td><td class="pos">{money(o.perPerson.income[1])}</td></tr>
                <tr><td>Ausgaben (Anteil)</td><td>{money(o.perPerson.expenseShare[0])}</td><td>{money(o.perPerson.expenseShare[1])}</td></tr>
                <tr class="sum"><td>Übrig</td><td class={o.perPerson.netAvg[0] < 0 ? 'neg' : ''}>{money(o.perPerson.netAvg[0])}</td><td class={o.perPerson.netAvg[1] < 0 ? 'neg' : ''}>{money(o.perPerson.netAvg[1])}</td></tr>
              </tbody>
            </table>
          </div>
        </>
      )}
      {openCat && detail && (
        <Modal title={openCat} onClose={() => setOpenCat(null)}>
          <p class="big"><strong>{money(detail.total)}</strong> im Zeitraum <span class="muted">({monthLabel(o.startYM)} bis {monthLabel(o.endYM)})</span></p>
          {detail.fixed.length > 0 && (
            <>
              <div class="lbl">Fixposten</div>
              <table class="grid"><tbody>
                {detail.fixed.map((f) => <tr><td>{f.label}<br /><small class="muted">{f.months} Monat{f.months === 1 ? '' : 'e'}</small></td><td>{money(f.total)}</td></tr>)}
              </tbody></table>
            </>
          )}
          {detail.entries.length > 0 && (
            <>
              <div class="lbl" style="margin-top:12px">Buchungen ({detail.entries.length})</div>
              <ul class="list">
                {detail.entries.map(({ entry: e, amount }) => (
                  <li key={e.id}>
                    <button class="item" onClick={() => onEditEntry(e)}>
                      <span class="main"><span class="title">{e.description || e.umbau?.trade || '–'}</span><span class="sub">{formatDate(e.date)} · {names[e.paidBy]}</span></span>
                      <span class="amt">{money(amount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {detail.fixed.length === 0 && detail.entries.length === 0 && <p class="muted">Nichts in dieser Kategorie.</p>}
        </Modal>
      )}
    </>
  );
}
