import { useEffect, useState } from 'preact/hooks';
import { IS_DEMO } from './demo';
import { newEntry, newRecurring, newUmbauEntry } from './defaults';
import { isIOS, isStandalone } from './files';
import { backupReminderNeeded } from './logic/backup';
import { ymOf } from './logic/dates';
import type { Entry, Recurring } from './logic/types';
import { deleteEntry, deleteRecurring, saveEntry, saveRecurring, saveSettings, useStore } from './store';
import { FixView } from './views/FixView';
import { EntryForm, RecurringForm } from './views/forms';
import { MonthView } from './views/MonthView';
import { OverviewView } from './views/OverviewView';
import { TagsView } from './views/TagsView';
import { Seg } from './views/ui';
import { tagOverview } from './logic/tags';
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
  const [monthMode, setMonthMode] = useState<'month' | 'overview' | 'tags'>('month');
  const [backupDismissed, setBackupDismissed] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  if (!ready) return <div class="loading">Lädt …</div>;

  const hasData = entries.length > 0 || recurring.length > 0;
  const showBackup = !backupDismissed && backupReminderNeeded(settings.lastBackupAt, hasData);
  const showInstall = !IS_DEMO && hasData && !settings.installHintDismissed && !isStandalone();

  const editEntry = (entry: Entry) => setEditor({ kind: 'entry', entry, isNew: !entries.some((e) => e.id === entry.id) });
  const editRec = (rec: Recurring) => setEditor({ kind: 'recurring', rec, isNew: !recurring.some((r) => r.id === rec.id) });
  const close = () => setEditor(null);
  const allTags = tagOverview(entries).map((t) => t.tag);

  return (
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

        {tab === 'month' && (
          <>
            <Seg value={monthMode} onChange={setMonthMode} options={[{ value: 'month', label: 'Monat' }, { value: 'overview', label: 'Überblick' }, { value: 'tags', label: 'Tags' }]} />
            <div style="height:12px" />
            {monthMode === 'month' && <MonthView ym={ym} setYm={setYm} settings={settings} entries={entries} recurring={recurring} onEditEntry={editEntry} onEditRecurring={editRec} />}
            {monthMode === 'overview' && <section><h1>Überblick</h1><OverviewView entries={entries} recurring={recurring} settings={settings} /></section>}
            {monthMode === 'tags' && <section><h1>Tags</h1><TagsView entries={entries} settings={settings} onEditEntry={editEntry} /></section>}
          </>
        )}
        {tab === 'add' && <QuickView settings={settings} entries={entries} allTags={allTags} onEditEntry={editEntry} onNew={() => editEntry(newEntry(settings))} />}
        {tab === 'fix' && <FixView recurring={recurring} settings={settings} onEdit={editRec} onNew={(t) => editRec(newRecurring(t))} />}
        {tab === 'umbau' && <UmbauView entries={entries} settings={settings} onEdit={editEntry} onNew={() => editEntry(newUmbauEntry(settings))} />}
        {tab === 'plan' && <PlanView entries={entries} recurring={recurring} settings={settings} />}
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

      {editor?.kind === 'entry' && (
        <EntryForm
          initial={editor.entry} settings={settings} allTags={allTags} umbauMode={!!editor.entry.umbau}
          onClose={close}
          onSave={async (e) => { await saveEntry(e); if (!e.umbau) setYm(ymOf(e.date)); close(); }}
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
  );
}
