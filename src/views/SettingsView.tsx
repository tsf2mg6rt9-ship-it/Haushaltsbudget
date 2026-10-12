import { useEffect, useState } from 'preact/hooks';
import { backupAgeDays, DEFAULT_SETTINGS, makeBackup, parseBackup } from '../logic/backup';
import { entriesCSV, recurringCSV } from '../logic/csv';
import type { Entry, Recurring, Settings } from '../logic/types';
import { isIOS, isStandalone, readFileText, saveFile } from '../files';
import { replaceAll, saveSettings, upsertEntries } from '../store';
import { colorForCategory, PALETTE } from '../logic/colors';
import { CatDot } from './ui';
import { addRule, entriesToRecategorize } from '../logic/rules';
import { hasNoData, IS_DEMO, loadDemo } from '../demo';
import { ImportView } from './ImportView';

const stamp = () => new Date().toISOString().slice(0, 10);

export function SettingsView({ settings, entries, recurring }: { settings: Settings; entries: Entry[]; recurring: Recurring[] }) {
  const [n1, setN1] = useState(settings.names[0]);
  const [n2, setN2] = useState(settings.names[1]);
  const [cats, setCats] = useState(settings.categories.join('\n'));
  const [msg, setMsg] = useState('');
  const [importing, setImporting] = useState(false);
  const [openColor, setOpenColor] = useState<string | null>(null);
  const [ruleMatch, setRuleMatch] = useState('');
  const [ruleCat, setRuleCat] = useState(settings.categories[0] ?? 'Sonstiges');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const age = backupAgeDays(settings.lastBackupAt);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 6000); };

  const exportJSON = async () => {
    const now = new Date();
    const updated = { ...settings, lastBackupAt: now.toISOString() };
    const ok = await saveFile(`haushaltsbudget-backup-${stamp()}.json`, 'application/json', JSON.stringify(makeBackup(updated, entries, recurring, now), null, 2));
    if (ok) { await saveSettings({ lastBackupAt: now.toISOString() }); flash('Backup gespeichert.'); }
  };

  const importJSON = async (ev: Event) => {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const res = parseBackup(await readFileText(file));
    if (!res.ok) return flash(res.error);
    const d = res.data;
    if (!confirm(`Backup vom ${d.exportedAt.slice(0, 10) || '?'} einspielen?\n${d.entries.length} Buchungen und ${d.recurring.length} Fixposten.\n\nAlle aktuellen Daten auf diesem Gerät werden ERSETZT.`)) return;
    await replaceAll({ ...d.settings, lastBackupAt: new Date().toISOString() }, d.entries, d.recurring);
    setN1(d.settings.names[0]); setN2(d.settings.names[1]); setCats(d.settings.categories.join('\n'));
    flash(`Importiert: ${d.entries.length} Buchungen, ${d.recurring.length} Fixposten${res.skipped ? ` (${res.skipped} fehlerhafte übersprungen)` : ''}.`);
  };

  const saveBasics = async () => {
    const list = [...new Set(cats.split('\n').map((c) => c.trim()).filter(Boolean))];
    await saveSettings({
      names: [n1.trim() || DEFAULT_SETTINGS.names[0], n2.trim() || DEFAULT_SETTINGS.names[1]],
      categories: list.length ? list : DEFAULT_SETTINGS.categories,
    });
    flash('Gespeichert.');
  };

  const wipe = async () => {
    if (!confirm('Wirklich ALLE Daten auf diesem Gerät löschen? Das kann nicht rückgängig gemacht werden.')) return;
    if (!confirm('Hast du ein Backup gemacht? Jetzt endgültig löschen?')) return;
    await replaceAll(DEFAULT_SETTINGS, [], []);
    setN1(DEFAULT_SETTINGS.names[0]); setN2(DEFAULT_SETTINGS.names[1]); setCats(DEFAULT_SETTINGS.categories.join('\n'));
    flash('Alle Daten gelöscht.');
  };

  return (
    <section>
      <h1>Mehr</h1>
      {importing && <ImportView settings={settings} entries={entries} recurring={recurring} onClose={() => setImporting(false)} />}
      {msg && <div class="toast" role="status">{msg}</div>}

      <div class="card">
        <div class="lbl">Personen & Kategorien</div>
        <div class="two">
          <label class="field"><span class="lbl">Person 1</span><input value={n1} onInput={(e) => setN1(e.currentTarget.value)} /></label>
          <label class="field"><span class="lbl">Person 2</span><input value={n2} onInput={(e) => setN2(e.currentTarget.value)} /></label>
        </div>
        <label class="field">
          <span class="lbl">Kategorien (eine pro Zeile)</span>
          <textarea rows={8} value={cats} onInput={(e) => setCats(e.currentTarget.value)} />
        </label>
        <button class="primary" onClick={saveBasics}>Speichern</button>
      </div>

      <div class="card">
        <div class="lbl">Kategoriefarben</div>
        <p class="muted">Jede Kategorie hat eine Farbe, die als Punkt neben den Buchungen erscheint. Tippe eine Kategorie an, um die Farbe zu ändern – sie gilt sofort für alle Buchungen, auch für bereits importierte.</p>
        <ul class="list">
          {settings.categories.map((c) => (
            <li>
              <button class="item" onClick={() => setOpenColor(openColor === c ? null : c)} aria-expanded={openColor === c}>
                <span class="main"><span class="title"><CatDot category={c} />{c}</span></span>
                <span class="muted">{openColor === c ? '▲' : '▼'}</span>
              </button>
              {openColor === c && (
                <div class="colorrow">
                  {PALETTE.map((hex) => (
                    <button class={`swatch ${colorForCategory(c, settings.categoryColors).toLowerCase() === hex.toLowerCase() ? 'on' : ''}`} style={`background:${hex}`} aria-label={`Farbe ${hex}`}
                      onClick={() => saveSettings({ categoryColors: { ...settings.categoryColors, [c]: hex } })} />
                  ))}
                  {settings.categoryColors[c] && <button class="link" onClick={() => { const { [c]: _drop, ...rest } = settings.categoryColors; void _drop; saveSettings({ categoryColors: rest }); }}>Zurücksetzen</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div class="card">
        <div class="lbl">Händler-Regeln für Kategorien</div>
        <p class="muted">Enthält eine Beschreibung den Suchbegriff, bekommt sie immer diese Kategorie – in der Schnelleingabe und beim Import. Regeln haben Vorrang vor allem anderen; bei mehreren Treffern gilt der längste Begriff.</p>
        {settings.categoryRules.length === 0 && <p class="hint">Noch keine Regeln. Beim Import legst du Regeln direkt in der Prüfliste an, wenn du eine Kategorie änderst.</p>}
        <ul class="list">
          {settings.categoryRules.map((r) => (
            <li>
              <div class="item">
                <span class="main"><span class="title">„{r.match}“</span><span class="sub">→ {r.category}</span></span>
                <button class="ghost" aria-label={`Regel ${r.match} löschen`} onClick={() => saveSettings({ categoryRules: settings.categoryRules.filter((x) => x !== r) })}>✕</button>
              </div>
            </li>
          ))}
        </ul>
        <div class="two">
          <label class="field"><span class="lbl">Begriff</span><input value={ruleMatch} placeholder="z. B. Hotel Hirschen" onInput={(e) => setRuleMatch(e.currentTarget.value)} /></label>
          <label class="field"><span class="lbl">Kategorie</span>
            <select value={ruleCat} onChange={(e) => setRuleCat(e.currentTarget.value)}>{settings.categories.map((c) => <option>{c}</option>)}</select>
          </label>
        </div>
        <div class="actions">
          <button class="primary" disabled={!ruleMatch.trim()} onClick={async () => {
            const rule = { match: ruleMatch.trim(), category: ruleCat };
            await saveSettings({ categoryRules: addRule(settings.categoryRules, rule.match, rule.category) });
            setRuleMatch('');
            const past = entriesToRecategorize(entries, [rule]);
            if (past.length > 0 && confirm(`Regel gespeichert. ${past.length} bestehende Buchung${past.length === 1 ? '' : 'en'} ebenfalls auf „${rule.category}“ setzen?`)) {
              await upsertEntries(past);
              flash(`Regel gespeichert, ${past.length} bestehende Buchungen umkategorisiert.`);
            } else flash('Regel gespeichert.');
          }}>Regel hinzufügen</button>
          {settings.categoryRules.length > 0 && (
            <button onClick={async () => {
              const changed = entriesToRecategorize(entries, settings.categoryRules);
              if (changed.length === 0) return flash('Alle bestehenden Buchungen passen bereits zu den Regeln.');
              if (confirm(`${changed.length} bestehende Buchungen nach den Regeln umkategorisieren?`)) { await upsertEntries(changed); flash(`${changed.length} Buchungen umkategorisiert.`); }
            }}>Auf bestehende Buchungen anwenden</button>
          )}
        </div>
      </div>

      <div class="card">
        <div class="lbl">Backup</div>
        <p class="muted">
          {age === null ? 'Noch kein Backup gemacht.' : age === 0 ? 'Letztes Backup: heute.' : `Letztes Backup: vor ${age} Tag${age === 1 ? '' : 'en'}.`}
          {' '}Deine Daten existieren nur auf diesem Gerät – das Backup ist deine einzige Sicherung. Am besten in iCloud Drive speichern und beim Freund einspielen.
        </p>
        <div class="actions">
          <button class="primary" onClick={exportJSON}>Backup exportieren (JSON)</button>
          <label class="button">Backup importieren<input type="file" accept=".json,application/json" hidden onChange={importJSON} /></label>
        </div>
      </div>

      <div class="card">
        <div class="lbl">Export für Numbers / Excel</div>
        <p class="muted">CSV mit Semikolon und Komma-Dezimalzeichen – öffnet sich direkt in Apple Numbers.</p>
        <div class="actions">
          <button onClick={() => saveFile(`buchungen-${stamp()}.csv`, 'text/csv', entriesCSV(entries, settings))}>Buchungen (CSV)</button>
          <button onClick={() => saveFile(`fixposten-${stamp()}.csv`, 'text/csv', recurringCSV(recurring, settings))}>Fixposten (CSV)</button>
        </div>
      </div>

      <div class="card">
        <div class="lbl">Kontoauszug importieren</div>
        <p class="muted">CSV aus dem Online-Banking einlesen – die Datei wird nur auf diesem Gerät verarbeitet. Duplikate und Fixposten werden erkannt.</p>
        <button onClick={() => setImporting(true)}>CSV-Kontoauszug importieren</button>
      </div>

      {hasNoData() && (
        <div class="card">
          <div class="lbl">Ausprobieren</div>
          <p class="muted">Lädt erfundene Beispieldaten, um die App kennenzulernen. Danach unter „Alle Daten löschen“ wieder leeren, bevor du echte Daten einträgst.</p>
          <button onClick={() => confirm('Beispieldaten laden? Es sind nur erfundene Zahlen.') && loadDemo()}>Beispieldaten laden</button>
        </div>
      )}

      <div class="card">
        <div class="lbl">Datenschutz & Speicher</div>
        <ul class="plain">
          <li>Alle Daten liegen ausschließlich in diesem Browser (IndexedDB). Kein Server, keine Accounts, kein Tracking.</li>
          <li>Persistenter Speicher: <strong>{persisted === null ? 'unbekannt' : persisted ? 'aktiv' : 'nicht gewährt'}</strong>.</li>
          <li>{isStandalone() ? 'Die App ist installiert – gut.' : isIOS()
            ? 'Wichtig: Tippe in Safari auf Teilen ▸ „Zum Home-Bildschirm“. Safari kann Daten nicht installierter Websites nach einiger Zeit löschen.'
            : 'Tipp: Installiere die App über das Browser-Menü („App installieren“), damit der Browser die Daten nicht aufräumt.'}</li>
          <li>Offline-Nutzung ist nach dem ersten Laden möglich.</li>
        </ul>
        <p class="hint">Version: {IS_DEMO ? 'Demo' : __APP_VERSION__}</p>
        {!IS_DEMO && 'serviceWorker' in navigator && (
          <button onClick={async () => {
            try { await (await navigator.serviceWorker.getRegistration())?.update(); } catch { /* offline */ }
            location.reload();
          }}>Nach Update suchen</button>
        )}
        <div style="height:12px" />
        <button class="danger" onClick={wipe}>Alle Daten löschen</button>
      </div>
    </section>
  );
}
