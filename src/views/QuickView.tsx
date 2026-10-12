import { useMemo, useState } from 'preact/hooks';
import { learnedCategories, newEntry, todayISO } from '../defaults';
import { formatDate } from '../logic/dates';
import { parseQuickEntry } from '../logic/quick';
import type { Entry, Settings } from '../logic/types';
import { saveEntry, saveSettings, uid } from '../store';
import { normalizeTags } from '../logic/tags';
import { money, TagInput, TagList } from './ui';

export function QuickView({
  settings, entries, allTags, onEditEntry, onNew,
}: {
  settings: Settings;
  allTags: string[];
  entries: Entry[];
  onEditEntry: (e: Entry) => void;
  onNew: () => void;
}) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const names = settings.names;
  const learned = useMemo(() => learnedCategories(entries), [entries]);
  const parsed = text.trim() ? parseQuickEntry(text, { today: todayISO(), names, categories: settings.categories, learned }) : null;

  const toEntry = (): Entry | null => {
    if (!parsed || parsed.amountCents === null) return null;
    return newEntry(settings, {
      id: uid(), date: parsed.date, description: parsed.description, category: parsed.category, amountCents: parsed.amountCents,
      type: parsed.type, share1Pct: parsed.share1Pct, paidBy: parsed.paidBy,
      tags: normalizeTags([...settings.activeTags, ...parsed.tags]).length ? normalizeTags([...settings.activeTags, ...parsed.tags]) : undefined,
    });
  };

  const quickSave = async () => {
    const e = toEntry();
    if (!e) return;
    await saveEntry(e);
    setSaved(`Gespeichert: ${e.description || e.category} ${money(e.amountCents)}`);
    setText('');
    setTimeout(() => setSaved(''), 4000);
  };

  const recent = [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 12);

  return (
    <section>
      <h1>Buchen</h1>
      <div class="card">
        <label class="lbl" for="quick">Schnelleingabe</label>
        <textarea
          id="quick" rows={3} value={text} onInput={(e) => setText(e.currentTarget.value)}
          placeholder={`z. B. „gestern 54,20 Billa halbe-halbe ich hab bezahlt“ – am iPhone mit dem Mikrofon der Tastatur diktieren`}
          autocapitalize="sentences" enterkeyhint="done"
        />
        {parsed && (
          <div class="preview" aria-live="polite">
            <div class="chips">
              <span class={`chip ${parsed.recognized.amount ? 'ok' : 'miss'}`}>{parsed.amountCents !== null ? money(parsed.amountCents) : 'Betrag fehlt'}</span>
              <span class={`chip ${parsed.recognized.date ? 'ok' : ''}`}>{formatDate(parsed.date)}</span>
              <span class="chip">{parsed.type === 'income' ? 'Einnahme' : 'Ausgabe'}</span>
              <span class="chip">{parsed.description || 'ohne Beschreibung'}</span>
              <span class={`chip ${parsed.recognized.category ? 'ok' : ''}`}>{parsed.category}</span>
              {parsed.type === 'expense' && (
                <span class={`chip ${parsed.recognized.split ? 'ok' : ''}`}>
                  {parsed.share1Pct === 50 ? '50/50' : parsed.share1Pct === 100 ? `nur ${names[0]}` : parsed.share1Pct === 0 ? `nur ${names[1]}` : `${parsed.share1Pct}/${100 - parsed.share1Pct}`}
                </span>
              )}
              {normalizeTags([...settings.activeTags, ...parsed.tags]).map((t) => <span class="chip ok">#{t}</span>)}
              <span class={`chip ${parsed.recognized.payer ? 'ok' : ''}`}>{parsed.type === 'income' ? 'für' : 'zahlte'} {names[parsed.paidBy]}</span>
            </div>
            <div class="actions">
              <button class="primary" disabled={parsed.amountCents === null} onClick={quickSave}>Speichern</button>
              <button disabled={parsed.amountCents === null} onClick={() => { const e = toEntry(); if (e) { onEditEntry(e); setText(''); } }}>Prüfen & ändern</button>
            </div>
          </div>
        )}
        {saved && <div class="toast" role="status">{saved}</div>}
        <p class="hint">Erkennt Betrag (1.234,50), Datum (heute, gestern, Montag, 03.10.), Aufteilung (halbe-halbe, nur ich, nur {names[1]}, 70 % ich) und wer bezahlt hat („{names[1]} hat bezahlt“). Alles lokal, ohne KI.</p>
      </div>

      <div class="card">
        <div class="lbl">Aktive Tags für neue Buchungen</div>
        <TagInput value={settings.activeTags} onChange={(activeTags) => saveSettings({ activeTags })} suggestions={allTags} />
        <p class="hint">Alles, was du jetzt einträgst, bekommt diese Tags automatisch – praktisch im Urlaub. Danach einfach entfernen. In der Schnelleingabe geht auch #Tag.</p>
      </div>

      <button class="wide" onClick={onNew}>＋ Manuell eintragen</button>

      <div class="card">
        <div class="lbl">Zuletzt</div>
        {recent.length === 0 && <p class="muted">Noch keine Buchungen.</p>}
        <ul class="list">
          {recent.map((e) => (
            <li key={e.id}>
              <button class="item" onClick={() => onEditEntry(e)}>
                <span class="main">
                  <span class="title">{e.description || e.umbau?.trade || '–'}</span>
                  <span class="sub">{formatDate(e.date)} · {e.category} · {names[e.paidBy]}<TagList tags={e.tags} /></span>
                </span>
                <span class={e.type === 'income' ? 'amt pos' : 'amt'}>{e.type === 'income' ? '+' : '−'}{money(e.amountCents)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
