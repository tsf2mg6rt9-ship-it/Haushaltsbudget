import { useEffect, useState } from 'preact/hooks';
import { IS_DEMO } from './demo';
import { newEntry, newRecurring, newUmbauEntry } from './defaults';
import { isIOS, isStandalone } from './files';
import { backupReminderNeeded } from './logic/backup';
import { ymOf } from './logic/dates';
import type { Entry, Recurring } from './logic/types';
import { deleteEntry, deleteRecurring, saveEntry, saveRecurring, saveSettings, upsertEntries, useStore } from './store';
import { FixView } from './views/FixView';
import { EntryForm, RecurringForm } from './views/forms';
import { MonthView } from './views/MonthView';
import { OverviewView } from './views/OverviewView';
import { TagsView } from './views/TagsView';
import { ListView } from './views/ListView';
import { ColorsCtx, Seg } from './views/ui';
import { tagOverview } from './logic/tags';
import { findFlags } from './logic/review';
import { applyStart, type Who } from './logic/calc';
import { addRule, entriesToRecategorize } from './logic/rules';
import { ReviewView } from './views/ReviewView';
import { PlanView } from './views/PlanView';
import { QuickView } from './views/QuickView';
import { SettingsView } from './views/SettingsView';
import { UmbauView } from './views/UmbauView';

type Tab = 'month' | 'add' | 'fix' | 'umbau' | 'plan' | 'more';
type Editor = { kind: 'entry'; entry: Entry; isNew: boolean } | { kind: 'recurring'; rec: Recurring; isNew: boolean } | null;

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'month', label: 'Monat', icon: '▦' },
  { id: 'add', label: 'Buchen', icon: '＋' },
  { id: 'fix', label: 'Fix', icon: '↻' },
  { id: 'umbau', label: 'Umbau', icon: '⌂' },
  { id: 'plan', label: 'Planung', icon: '↗' },
  { id: 'more', label: 'Mehr', icon: '⋯' },
];

export function App() {
  const { ready, settings, entries, recurring, dbError } = useStore();
  const [tab, setTab] = useState<Tab>('month');
  const [ym, setYm] = useState(ymOf(new Date()));
  const [editor, setEditor] = useState<Editor>(null);
  const [monthMode, setMonthMode] = useState<'month' | 'overview' | 'tags' | 'list'>('month');
  const [backupDismissed, setBackupDismissed] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [who, setWho] = useState<Who>('all');

  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  if (!ready) return <div class="loading">Lädt …</div>;

  const hasData = entries.length > 0 || recurring.length > 0;
  const showBackup = !backupDismissed && backupReminderNeeded(settings.lastBackupAt, hasData);
  const showInstall = !IS_DEMO && hasData && !settings.installHintDismissed && !isStandalone();

  const editEntry = (entry: Entry) => setEditor({ kind: 'entry', entry, isNew: !entries.some((e) => e.id === entry.id) });
  const editRec = (rec: Recurring) => setEditor({ kind: 'recurring', rec, isNew: !recurring.some((r) => r.id === rec.id) });
  const close = () => setEditor(null);
  const allTags = tagOverview(entries).map((t) => t.tag);
  // Auswertungsbeginn: Berechnungen und Auswertungen sehen nur Daten ab diesem Monat
  const scoped = applyStart(entries, recurring, settings.startMonth);
  const flags = findFlags(scoped.entries, scoped.recurring, settings.importIgnoreTerms);

  return (
    <ColorsCtx.Provider value={settings.categoryColors}>
    <div class="app">
      <main>
        {dbError && !IS_DEMO && <div class="banner error" role="alert">{dbError}</div>}
        {IS_DEMO && <div class="banner" role="note"><span>Demo mit erfundenen Daten – nichts davon ist echt. Alle Änderungen gehen beim Schließen verloren.</span></div>}
        {showBackup && !IS_DEMO && (
          <div class="banner" role="status">
            <span>{settings.lastBackupAt ? 'Dein letztes Backup ist älter als 14 Tage.' : 'Du hast noch kein Backup gemacht.'}</span>
            <button class="link" onClick={() => setTab('more')}>Jetzt sichern</button>
            <button class="ghost" aria-label="Ausblenden" onClick={() => setBackupDismissed(true)}>✕</button>
          </div>
        )}
        {showInstall && (
          <div class="banner" role="note">
            <span>{isIOS() ? 'Tipp: Teilen ▸ „Zum Home-Bildschirm“ – sonst kann Safari deine Daten löschen.' : 'Tipp: Installiere die App, damit der Browser deine Daten nicht aufräumt.'}</span>
            <button class="ghost" aria-label="Ausblenden" onClick={() => saveSettings({ installHintDismissed: true })}>✕</button>
          </div>
        )}

        {tab === 'month' && flags.size > 0 && (
          <div class="banner warn" role="alert">
            <span>⚠ {flags.size} Buchung{flags.size === 1 ? '' : 'en'} zu prüfen (möglicherweise doppelt gezählt).</span>
            <button class="link" onClick={() => setReviewing(true)}>Ansehen</button>
          </div>
        )}
        {tab === 'month' && (
          <>
            <Seg value={monthMode} onChange={setMonthMode} options={[{ value: 'month', label: 'Monat' }, { value: 'overview', label: 'Überblick' }, { value: 'tags', label: 'Tags' }, { value: 'list', label: 'Buchungen' }]} />
            <div style="height:12px" />
            {monthMode === 'month' && <MonthView ym={ym} setYm={setYm} settings={settings} entries={scoped.entries} recurring={scoped.recurring} onEditEntry={editEntry} onEditRecurring={editRec} onNewSettlement={editEntry} flags={flags} who={who} setWho={setWho} />}
            {monthMode === 'overview' && <section><h1>Überblick</h1><OverviewView entries={scoped.entries} recurring={scoped.recurring} settings={settings} onEditEntry={editEntry} /></section>}
            {monthMode === 'list' && <section><h1>Alle Buchungen</h1><ListView entries={entries} settings={settings} onEditEntry={editEntry} /></section>}
            {monthMode === 'tags' && <section><h1>Tags</h1><TagsView entries={scoped.entries} settings={settings} onEditEntry={editEntry} /></section>}
          </>
        )}
        {tab === 'add' && <QuickView settings={settings} entries={entries} allTags={allTags} onEditEntry={editEntry} onNew={() => editEntry(newEntry(settings))} />}
        {tab === 'fix' && <FixView recurring={recurring} settings={settings} onEdit={editRec} onNew={(t) => editRec(newRecurring(t))} />}
        {tab === 'umbau' && <UmbauView entries={entries} settings={settings} onEdit={editEntry} onNew={() => editEntry(newUmbauEntry(settings))} />}
        {tab === 'plan' && <PlanView entries={scoped.entries} recurring={scoped.recurring} settings={settings} />}
        {tab === 'more' && <SettingsView settings={settings} entries={entries} recurring={recurring} />}
      </main>

      <nav class="tabbar" aria-label="Hauptnavigation">
        {TABS.map((t) => (
          <button key={t.id} class={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span class="ic" aria-hidden="true">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <datalist id="taglist">
        {allTags.map((t) => <option value={t} />)}
      </datalist>
      <datalist id="trades">
        {[...new Set(entries.map((e) => e.umbau?.trade).filter(Boolean))].map((t) => <option value={t} />)}
      </datalist>

      {reviewing && <ReviewView entries={scoped.entries} flags={flags} settings={settings} onEdit={editEntry} onClose={() => setReviewing(false)} />}
      {editor?.kind === 'entry' && (
        <EntryForm
          initial={editor.entry} settings={settings} allTags={allTags} entries={entries} umbauMode={!!editor.entry.umbau}
          onClose={close}
          onSave={async (e, rule) => {
            await saveEntry(e);
            if (rule) {
              await saveSettings({ categoryRules: addRule(settings.categoryRules, rule.match, rule.category) });
              const others = entriesToRecategorize(entries.filter((x) => x.id !== e.id), [rule]);
              if (others.length) await upsertEntries(others);
            }
            if (!e.umbau) setYm(ymOf(e.date));
            close();
          }}
          onDelete={editor.isNew ? undefined : async () => { await deleteEntry(editor.entry.id); close(); }}
        />
      )}
      {editor?.kind === 'recurring' && (
        <RecurringForm
          initial={editor.rec} settings={settings} onClose={close}
          onSave={async (r) => { await saveRecurring(r); close(); }}
          onDelete={editor.isNew ? undefined : async () => { await deleteRecurring(editor.rec.id); close(); }}
        />
      )}
    </div>
    </ColorsCtx.Provider>
  );
}
