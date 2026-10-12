import { useEffect, useState } from 'preact/hooks';
import { applyBulk, EMPTY_FILTER, filterEntries, importBatches, type BulkPatch, type EntryFilter } from '../logic/bulk';
import { formatDate } from '../logic/dates';
import { tagOverview } from '../logic/tags';
import type { Entry, Settings } from '../logic/types';
import { deleteEntries, upsertEntries } from '../store';
import { CatDot, Field, Modal, money, Seg, TagInput, TagList } from './ui';

const PAGE = 120;

function shareLabel(e: Entry, names: [string, string]): string {
  if (e.type !== 'expense') return '';
  return e.share1Pct === 50 ? '50/50' : e.share1Pct === 100 ? `nur ${names[0]}` : e.share1Pct === 0 ? `nur ${names[1]}` : `${e.share1Pct}/${100 - e.share1Pct}`;
}

export function ListView({ entries, settings, onEditEntry }: { entries: Entry[]; settings: Settings; onEditEntry: (e: Entry) => void }) {
  const names = settings.names;
  const [f, setF] = useState<EntryFilter>(EMPTY_FILTER);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [bulk, setBulk] = useState(false);
  const [msg, setMsg] = useState('');
  const batches = importBatches(entries);
  const tags = tagOverview(entries);
  const filtered = filterEntries(entries, f);
  const chosen = filtered.filter((e) => sel.has(e.id));
  const patch = (p: Partial<EntryFilter>) => { setF({ ...f, ...p }); setSel(new Set()); setLimit(PAGE); };
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 6000); };
  const active = JSON.stringify(f) !== JSON.stringify(EMPTY_FILTER);

  // Auswahl auf noch vorhandene Buchungen beschränken (z. B. nach dem Löschen)
  useEffect(() => { setSel((s) => new Set([...s].filter((id) => entries.some((e) => e.id === id)))); }, [entries]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const batchLabel = (id: string) => { const b = batches.find((x) => x.id === id)!; return `${new Date(b.id).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })} · ${b.count} Buchungen (${formatDate(b.firstDate)} – ${formatDate(b.lastDate)})`; };

  return (
    <>
      {msg && <div class="toast" role="status">{msg}</div>}
      <div class="card">
        <div class="lbl">Filter</div>
        <input type="search" placeholder="Suchen (Beschreibung, Kategorie, Tag …)" value={f.q} onInput={(e) => patch({ q: e.currentTarget.value })} aria-label="Suchen" />
        <div class="two" style="margin-top:8px">
          <select value={f.category} onChange={(e) => patch({ category: e.currentTarget.value })} aria-label="Kategorie">
            <option value="">Alle Kategorien</option>
            {[...new Set([...settings.categories, ...entries.map((e) => e.category)])].map((c) => <option>{c}</option>)}
          </select>
          <select value={f.type} onChange={(e) => patch({ type: e.currentTarget.value as EntryFilter['type'] })} aria-label="Art">
            <option value="all">Alle Arten</option><option value="expense">Ausgaben</option><option value="income">Einnahmen</option><option value="settlement">Ausgleich</option>
          </select>
          <select value={f.share} onChange={(e) => patch({ share: e.currentTarget.value as EntryFilter['share'] })} aria-label="Aufteilung">
            <option value="all">Jede Aufteilung</option><option value="half">50/50</option><option value="p1">nur {names[0]}</option><option value="p2">nur {names[1]}</option><option value="other">Andere Aufteilung</option>
          </select>
          <select value={f.payer} onChange={(e) => patch({ payer: e.currentTarget.value as EntryFilter['payer'] })} aria-label="Bezahlt von">
            <option value="all">Bezahlt von: alle</option><option value="0">{names[0]}</option><option value="1">{names[1]}</option>
          </select>
          <select value={f.source} onChange={(e) => patch({ source: e.currentTarget.value as EntryFilter['source'], batch: '' })} aria-label="Herkunft">
            <option value="all">Alle Herkünfte</option><option value="import">Nur Importierte</option><option value="manual">Nur selbst eingetragene</option>
          </select>
          <select value={f.tag} onChange={(e) => patch({ tag: e.currentTarget.value })} aria-label="Tag">
            <option value="">Alle Tags</option>
            {tags.map((t) => <option value={t.tag}>#{t.tag}</option>)}
          </select>
        </div>
        {batches.length > 0 && (
          <select style="margin-top:8px" value={f.batch} onChange={(e) => patch({ batch: e.currentTarget.value })} aria-label="Import">
            <option value="">Alle Importe</option>
            {batches.map((b) => <option value={b.id}>Import {batchLabel(b.id)}</option>)}
          </select>
        )}
        <div class="two" style="margin-top:8px">
          <label class="field" style="margin:0"><span class="lbl">Von Monat</span><input type="month" value={f.from} onInput={(e) => patch({ from: e.currentTarget.value })} /></label>
          <label class="field" style="margin:0"><span class="lbl">Bis Monat</span><input type="month" value={f.to} onInput={(e) => patch({ to: e.currentTarget.value })} /></label>
        </div>
        {active && <button class="link" onClick={() => patch({ ...EMPTY_FILTER })}>Filter zurücksetzen</button>}
      </div>

      <div class="card">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap">
          <div class="lbl" style="margin:0">{filtered.length} von {entries.length} Buchungen · {chosen.length} ausgewählt</div>
          <div class="actions" style="margin:0">
            <button onClick={() => setSel(new Set(filtered.map((e) => e.id)))} disabled={filtered.length === 0}>Alle {filtered.length} auswählen</button>
            {chosen.length > 0 && <button onClick={() => setSel(new Set())}>Auswahl aufheben</button>}
          </div>
        </div>
        {f.batch && (
          <div class="actions">
            <button class="danger" onClick={async () => {
              if (confirm(`Diesen Import komplett rückgängig machen und ${filtered.length} Buchungen löschen?`)) { await deleteEntries(filtered.map((e) => e.id)); patch({ batch: '' }); flash('Import rückgängig gemacht.'); }
            }}>Diesen Import rückgängig machen</button>
          </div>
        )}
        {filtered.length === 0 && <p class="muted">Keine Buchungen für diese Filter.</p>}
        <ul class="list">
          {filtered.slice(0, limit).map((e) => (
            <li key={e.id} class={sel.has(e.id) ? 'picked' : ''}>
              <div class="pickrow">
                <input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} aria-label="Auswählen" />
                <button class="item" onClick={() => onEditEntry(e)}>
                  <span class="main">
                    <span class="title"><CatDot category={e.category} />{e.type === 'settlement' ? `Ausgleich: ${names[e.paidBy]} → ${names[e.paidBy === 0 ? 1 : 0]}` : e.description || e.umbau?.trade || '–'}</span>
                    <span class="sub">{formatDate(e.date)} · {e.category}{e.type !== 'settlement' ? ` · ${names[e.paidBy]}` : ''}{e.type === 'expense' ? ` · ${shareLabel(e, names)}` : ''}<TagList tags={e.tags} /></span>
                  </span>
                  <span class={e.type === 'income' ? 'amt pos' : 'amt'}>{e.type === 'income' ? '+' : e.type === 'settlement' ? '⇄ ' : '−'}{money(e.amountCents)}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
        {filtered.length > limit && <button class="wide" onClick={() => setLimit(limit + PAGE)}>Weitere {Math.min(PAGE, filtered.length - limit)} anzeigen</button>}
      </div>

      {chosen.length > 0 && (
        <div class="bulkbar" role="region" aria-label="Auswahl bearbeiten">
          <span><strong>{chosen.length}</strong> ausgewählt</span>
          <button class="primary" onClick={() => setBulk(true)}>Ändern …</button>
          <button class="danger" onClick={async () => { if (confirm(`${chosen.length} Buchungen endgültig löschen?`)) { await deleteEntries(chosen.map((e) => e.id)); setSel(new Set()); flash(`${chosen.length} Buchungen gelöscht.`); } }}>Löschen</button>
        </div>
      )}

      {bulk && (
        <BulkModal
          chosen={chosen} settings={settings} allTags={tags.map((t) => t.tag)}
          onClose={() => setBulk(false)}
          onApply={async (p) => {
            const changed = applyBulk(chosen, p);
            if (changed.length) await upsertEntries(changed);
            setBulk(false); setSel(new Set());
            flash(changed.length ? `${changed.length} Buchungen geändert.` : 'Es gab nichts zu ändern.');
          }}
        />
      )}
    </>
  );
}

function BulkModal({ chosen, settings, allTags, onClose, onApply }: { chosen: Entry[]; settings: Settings; allTags: string[]; onClose: () => void; onApply: (p: BulkPatch) => void }) {
  const names = settings.names;
  const [share, setShare] = useState<'keep' | 'half' | 'p1' | 'p2' | 'custom'>('keep');
  const [custom, setCustom] = useState(60);
  const [payer, setPayer] = useState<'keep' | '0' | '1'>('keep');
  const [category, setCategory] = useState('');
  const [addTags, setAddTags] = useState<string[]>([]);
  const [rmTags, setRmTags] = useState<string[]>([]);
  const nExp = chosen.filter((e) => e.type === 'expense').length;
  const nPay = chosen.filter((e) => e.type !== 'settlement').length;
  const present = tagOverview(chosen).map((t) => t.tag);

  const build = (): BulkPatch => ({
    ...(share !== 'keep' ? { share1Pct: share === 'half' ? 50 : share === 'p1' ? 100 : share === 'p2' ? 0 : custom } : {}),
    ...(payer !== 'keep' ? { paidBy: +payer as 0 | 1 } : {}),
    ...(category ? { category } : {}),
    ...(addTags.length ? { addTags } : {}),
    ...(rmTags.length ? { removeTags: rmTags } : {}),
  });
  const changes = applyBulk(chosen, build()).length;

  return (
    <Modal title={`${chosen.length} Buchungen ändern`} onClose={onClose}>
      <p class="muted">Nur was du hier einstellst, wird geändert. „Unverändert“ lässt alles, wie es ist.</p>
      <div class="lbl" style="margin-top:8px">Aufteilung (nur Ausgaben, {nExp} von {chosen.length})</div>
      <Seg value={share} onChange={setShare} options={[{ value: 'keep', label: 'Unverändert' }, { value: 'half', label: '50/50' }, { value: 'p1', label: `nur ${names[0]}` }, { value: 'p2', label: `nur ${names[1]}` }, { value: 'custom', label: 'Andere' }]} />
      {share === 'custom' && (
        <div class="row" style="margin-top:8px"><input type="range" min="0" max="100" value={custom} onInput={(e) => setCustom(+e.currentTarget.value)} /><span class="pct">{custom} % / {100 - custom} %</span></div>
      )}
      <div class="lbl" style="margin-top:14px">Bezahlt von / Einnahme für ({nPay} Buchungen)</div>
      <Seg value={payer} onChange={setPayer} options={[{ value: 'keep', label: 'Unverändert' }, { value: '0', label: names[0] }, { value: '1', label: names[1] }]} />
      <Field label="Kategorie">
        <select value={category} onChange={(e) => setCategory(e.currentTarget.value)}>
          <option value="">– unverändert –</option>
          {settings.categories.map((c) => <option>{c}</option>)}
        </select>
      </Field>
      <div class="field">
        <span class="lbl">Tags hinzufügen</span>
        <TagInput value={addTags} onChange={setAddTags} suggestions={allTags} />
      </div>
      {present.length > 0 && (
        <div class="field">
          <span class="lbl">Tags entfernen</span>
          <div class="chips">
            {present.map((t) => <button type="button" class={`chip ${rmTags.includes(t) ? 'on-chip' : ''}`} onClick={() => setRmTags(rmTags.includes(t) ? rmTags.filter((x) => x !== t) : [...rmTags, t])}>{rmTags.includes(t) ? '✕ ' : ''}#{t}</button>)}
          </div>
        </div>
      )}
      <p class="hint">Bei Ausgleichszahlungen werden Aufteilung, Zahler und Kategorie nie verändert.</p>
      <div class="actions">
        <button onClick={onClose}>Abbrechen</button>
        <span class="spacer" />
        <button class="primary" disabled={changes === 0} onClick={() => onApply(build())}>{changes === 0 ? 'Nichts zu ändern' : `${changes} Buchungen ändern`}</button>
      </div>
    </Modal>
  );
}
