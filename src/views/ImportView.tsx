import { useMemo, useState } from 'preact/hooks';
import { learnedCategories } from '../defaults';
import { buildCandidates, detectHeaderRow, detectMapping, detectMappingFromData, parseCSV, type Candidate, type Mapping } from '../logic/bankcsv';
import { formatDate } from '../logic/dates';
import type { Entry, Recurring, Settings } from '../logic/types';
import { readFileSmart } from '../files';
import { deleteEntries, saveEntries, saveSettings, uid, upsertEntries } from '../store';
import { addRule, entriesToRecategorize, suggestMatchTerm } from '../logic/rules';
import { normalizeTags, tagOverview } from '../logic/tags';
import { CatDot, Field, Modal, Seg, TagInput, money } from './ui';

type Step = 'pick' | 'map' | 'review' | 'done';

export function ImportView({ settings, entries, recurring, onClose }: { settings: Settings; entries: Entry[]; recurring: Recurring[]; onClose: () => void }) {
  const names = settings.names;
  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState(0); // -1 = keine Kopfzeile
  const [map, setMap] = useState<Mapping>({ date: null, amount: null, debit: null, credit: null, text: [], invert: false });
  const [owner, setOwner] = useState<0 | 1>(0);
  const [share, setShare] = useState<number | null>(null);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [ignore, setIgnore] = useState(settings.importIgnoreTerms.join(', '));
  const [tags, setTags] = useState<string[]>([]);
  const [touched, setTouched] = useState<Record<number, boolean>>({});
  const [ruleMsg, setRuleMsg] = useState('');
  const [err, setErr] = useState('');
  const [imported, setImported] = useState(0);
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const learned = useMemo(() => learnedCategories(entries), [entries]);

  const first = rows[Math.max(headerRow, 0)] ?? [];
  const header = headerRow >= 0 ? first : first.map((v) => `Spalte (z. B. ${v.trim().slice(0, 18) || 'leer'})`);

  const onFile = async (ev: Event) => {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setErr('');
    try {
      const parsed = parseCSV(await readFileSmart(file));
      if (parsed.length < 2) return setErr('Die Datei enthält keine Datenzeilen.');
      const h = detectHeaderRow(parsed);
      setRows(parsed); setHeaderRow(h); setFileName(file.name); setMap(h < 0 ? detectMappingFromData(parsed) : detectMapping(parsed[h]));
      setStep('map');
    } catch {
      setErr('Die Datei konnte nicht gelesen werden.');
    }
  };

  const colOptions = [{ v: '', l: '– keine –' }, ...header.map((h, i) => ({ v: String(i), l: `${i + 1}: ${h.trim() || '(leer)'}` }))];
  const sel = (value: number | null, onChange: (n: number | null) => void) => (
    <select value={value === null ? '' : String(value)} onChange={(e) => onChange(e.currentTarget.value === '' ? null : +e.currentTarget.value)}>
      {colOptions.map((o) => <option value={o.v}>{o.l}</option>)}
    </select>
  );

  const mapOk = map.date !== null && (map.amount !== null || map.debit !== null || map.credit !== null);
  const preview = mapOk ? buildCandidates(rows.slice(0, headerRow + 6), headerRow, map, { existing: [], recurring: [], categories: settings.categories }).candidates.slice(0, 4) : [];

  const toReview = () => {
    const terms = ignore.split(',').map((t) => t.trim()).filter(Boolean);
    saveSettings({ importIgnoreTerms: terms });
    const res = buildCandidates(rows, headerRow, map, { existing: entries, recurring, categories: settings.categories, learned, ignoreTerms: terms, rules: settings.categoryRules, owner });
    if (res.candidates.length === 0) return setErr('Es wurden keine gültigen Zeilen erkannt. Prüfe die Spaltenzuordnung.');
    setErr(''); setCands(res.candidates); setSkipped(res.skipped); setStep('review');
  };

  const patch = (i: number, p: Partial<Candidate>) => {
    setCands((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));
    if (p.category !== undefined) { setTouched((t) => ({ ...t, [i]: true })); setRuleMsg(''); }
  };
  const makeRule = async (i: number) => {
    const c = cands[i];
    const term = suggestMatchTerm(c.description);
    await saveSettings({ categoryRules: addRule(settings.categoryRules, term, c.category) });
    const low = term.toLowerCase();
    const past = entriesToRecategorize(entries, [{ match: term, category: c.category }]);
    if (past.length) await upsertEntries(past);
    let n = 0;
    setCands((cs) => cs.map((x) => (!x.partner && x.description.toLowerCase().includes(low) ? (n++, { ...x, category: c.category }) : x)));
    setTouched((t) => ({ ...t, [i]: false }));
    setRuleMsg(`Regel gespeichert: „${term}“ → ${c.category} (gilt für ${n} Zeilen in dieser Liste${past.length ? `, ${past.length} bereits importierte Buchungen wurden ebenfalls geändert` : ''} und künftig immer).`);
  };
  const chosen = cands.filter((c) => c.selected);

  const doImport = async () => {
    const partnerIdx = owner === 0 ? 1 : 0;
    const importId = new Date().toISOString();
    const pct = share ?? 50;
    const list: Entry[] = chosen.map((c) => c.partner
      ? {
        // Zahlung von/an den Partner = Ausgleich (weder Einnahme noch Ausgabe)
        id: uid(), date: c.date, description: c.description, category: 'Ausgleich', amountCents: c.amountCents, type: 'settlement' as const,
        share1Pct: 50, paidBy: c.type === 'income' ? (partnerIdx as 0 | 1) : owner, note: 'Import Kontoauszug', importId,
      }
      : {
        id: uid(), date: c.date, description: c.description, category: c.category, amountCents: c.amountCents, type: c.type,
        share1Pct: pct, paidBy: owner, note: 'Import Kontoauszug', importId, ...(tags.length ? { tags: normalizeTags(tags) } : {}),
      });
    await saveEntries(list);
    setImported(list.length); setImportedIds(list.map((x) => x.id)); setStep('done');
  };

  return (
    <Modal title="Kontoauszug importieren (CSV)" onClose={onClose}>
      {step === 'pick' && (
        <>
          <p class="muted">Die Datei wird nur auf diesem Gerät gelesen und verlässt es nie. Exportiere den Kontoauszug im Online-Banking als CSV und wähle ihn hier aus.</p>
          <label class="button primary" style="width:100%">CSV-Datei auswählen
            <input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={onFile} />
          </label>
          {err && <div class="error" role="alert">{err}</div>}
          <p class="hint">Tipp: Erst die Fixposten (Miete, Gehalt …) im Tab „Fix“ anlegen. Passende Zeilen im Auszug werden dann erkannt und nicht doppelt gezählt.</p>
        </>
      )}

      {step === 'map' && (
        <>
          <p class="muted">{fileName} · {rows.length - headerRow - 1} Zeilen{headerRow < 0 ? ' (ohne Kopfzeile)' : ''}. Prüfe, ob die Spalten richtig erkannt wurden.</p>
          <Field label="Datum">{sel(map.date, (n) => setMap({ ...map, date: n }))}</Field>
          <Field label="Betrag (mit Vorzeichen)">{sel(map.amount, (n) => setMap({ ...map, amount: n, debit: n === null ? map.debit : null, credit: n === null ? map.credit : null }))}</Field>
          {map.amount === null && (
            <div class="two">
              <Field label="Soll / Belastung">{sel(map.debit, (n) => setMap({ ...map, debit: n }))}</Field>
              <Field label="Haben / Gutschrift">{sel(map.credit, (n) => setMap({ ...map, credit: n }))}</Field>
            </div>
          )}
          <div class="two">
            <Field label="Beschreibung 1 (z. B. Partner)">{sel(map.text[0] ?? null, (n) => setMap({ ...map, text: [n, map.text[1] ?? null].filter((x): x is number => x !== null) }))}</Field>
            <Field label="Beschreibung 2 (Verwendungszweck)">{sel(map.text[1] ?? null, (n) => setMap({ ...map, text: [map.text[0] ?? null, n].filter((x): x is number => x !== null) }))}</Field>
          </div>
          <label class="check"><input type="checkbox" checked={map.invert} onChange={(e) => setMap({ ...map, invert: e.currentTarget.checked })} /> Vorzeichen umkehren (falls Ausgaben als positiv angezeigt werden)</label>

          <div class="lbl" style="margin-top:14px">Wem gehört das Konto?</div>
          <Seg value={owner} onChange={setOwner} options={[{ value: 0, label: names[0] }, { value: 1, label: names[1] }]} />
          <div class="hint">Diese Person gilt als „bezahlt von“ bzw. als Empfänger der Einnahmen.</div>
          <div class="lbl" style="margin-top:14px">Aufteilung der Ausgaben – bitte wählen</div>
          <Seg<number> value={share ?? -1} onChange={(v: number) => setShare(v)} options={[{ value: 50, label: '50/50' }, { value: 100, label: `nur ${names[0]}` }, { value: 0, label: `nur ${names[1]}` }]} />
          <div class="hint">Gilt für alle importierten Ausgaben. Für ein Privatkonto passt „nur {names[owner]}“. Spätere Änderungen gehen gesammelt unter „Buchungen“ (Tab „Monat“).</div>

          <div class="field">
            <span class="lbl">Tags für alle importierten Buchungen (optional)</span>
            <TagInput value={tags} onChange={setTags} suggestions={tagOverview(entries).map((t) => t.tag)} />
          </div>
          <Field label="Zahlungen vom/an deinen Partner (optional)" hint="Namen oder Begriffe, durch Komma getrennt – z. B. der Name deines Partners im Kontoauszug. Solche Überweisungen werden als Ausgleichszahlung importiert: Sie zählen weder als Einnahme noch als Ausgabe, sondern verringern den offenen Ausgleich. Umbuchungen auf eigene Konten (Revolut) erkennt die App selbst und wählt sie ab.">
            <input value={ignore} placeholder="z. B. Müller Anna" onInput={(e) => setIgnore(e.currentTarget.value)} />
          </Field>

          {preview.length > 0 && (
            <div class="preview">
              <div class="lbl">Vorschau</div>
              <ul class="list">
                {preview.map((c) => (
                  <li><div class="item"><span class="main"><span class="title">{c.description || '–'}</span><span class="sub">{formatDate(c.date)}</span></span><span class={c.type === 'income' ? 'amt pos' : 'amt'}>{c.type === 'income' ? '+' : '−'}{money(c.amountCents)}</span></div></li>
                ))}
              </ul>
            </div>
          )}
          {err && <div class="error" role="alert">{err}</div>}
          <div class="actions">
            <button onClick={() => setStep('pick')}>Zurück</button>
            <span class="spacer" />
            <button class="primary" disabled={!mapOk || share === null} onClick={toReview}>Weiter</button>
          </div>
        </>
      )}

      {step === 'review' && (
        <>
          <p class="muted">{chosen.length} von {cands.length} Zeilen ausgewählt{skipped ? ` · ${skipped} nicht lesbare Zeilen übersprungen` : ''}. Duplikate, Fixposten und Umbuchungen auf eigene Konten sind abgewählt.</p>
          <div class="actions" style="margin-top:0">
            <button onClick={() => setCands((cs) => cs.map((c) => ({ ...c, selected: !c.duplicate && !c.fixMatch && !c.transfer })))}>Empfohlen</button>
            <button onClick={() => setCands((cs) => cs.map((c) => ({ ...c, selected: true })))}>Alle</button>
            <button onClick={() => setCands((cs) => cs.map((c) => ({ ...c, selected: false })))}>Keine</button>
          </div>
          {ruleMsg && <div class="toast" role="status">{ruleMsg}</div>}
          <ul class="list import-list">
            {cands.map((c, i) => (
              <li key={c.row} class={c.selected ? '' : 'off'}>
                <div class="imp">
                  <label class="imp-main">
                    <input type="checkbox" checked={c.selected} onChange={(e) => patch(i, { selected: e.currentTarget.checked })} aria-label="Importieren" />
                    <span class="main">
                      <span class="title"><CatDot category={c.category} />{c.description || '–'}</span>
                      <span class="sub">{formatDate(c.date)}
                        {c.duplicate && <span class="tag warn">schon vorhanden</span>}
                        {c.fixMatch && <span class="tag warn">Fixposten{c.fixLabel ? ` „${c.fixLabel}“` : ''}?</span>}
                        {c.transfer && <span class="tag warn">Umbuchung?</span>}
                        {c.partner && <span class="tag ok">Ausgleich Partner</span>}
                      </span>
                    </span>
                    <span class={c.type === 'income' ? 'amt pos' : 'amt'}>{c.type === 'income' ? '+' : '−'}{money(c.amountCents)}</span>
                  </label>
                  {!c.partner && (
                    <select value={c.category} onChange={(e) => patch(i, { category: e.currentTarget.value })} aria-label="Kategorie">
                      {[...new Set([...settings.categories, c.category])].map((k) => <option>{k}</option>)}
                    </select>
                  )}
                  {touched[i] && !c.partner && (
                    <button class="link" onClick={() => makeRule(i)}>Immer „{suggestMatchTerm(c.description)}“ → {c.category}</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div class="actions sticky">
            <button onClick={() => setStep('map')}>Zurück</button>
            <span class="spacer" />
            <button class="primary" disabled={chosen.length === 0} onClick={doImport}>{chosen.length} importieren</button>
          </div>
        </>
      )}

      {step === 'done' && (
        <>
          <p class="big">{imported} Buchungen importiert.</p>
          <p class="muted">Du findest sie im Tab „Monat“ im jeweiligen Monat. Kategorien und Aufteilung kannst du dort einzeln anpassen. Mach danach am besten ein Backup.</p>
          <div class="actions">
            <button class="danger" onClick={async () => { if (confirm(`Diesen Import mit ${imported} Buchungen sofort rückgängig machen?`)) { await deleteEntries(importedIds); onClose(); } }}>Import rückgängig machen</button>
            <span class="spacer" /><button class="primary" onClick={onClose}>Fertig</button>
          </div>
        </>
      )}
    </Modal>
  );
}
