import { useState } from 'preact/hooks';
import { formatDate } from '../logic/dates';
import { filterByTags, hasTag, renameTag, summarizeEntries, tagOverview } from '../logic/tags';
import type { Entry, Settings } from '../logic/types';
import { upsertEntries } from '../store';
import { money, TagList } from './ui';

export function TagsView({ entries, settings, onEditEntry }: { entries: Entry[]; settings: Settings; onEditEntry: (e: Entry) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const names = settings.names;
  const tags = tagOverview(entries);
  const sel = selected.filter((t) => tags.some((x) => x.tag.toLowerCase() === t.toLowerCase()));
  const filtered = filterByTags(entries, sel).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const sum = summarizeEntries(filtered);
  const toggle = (t: string) => setSelected(sel.some((x) => x.toLowerCase() === t.toLowerCase()) ? sel.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...sel, t]);

  const doRename = async (from: string, to: string) => {
    const changed = renameTag(entries, from, to.trim());
    if (changed.length) await upsertEntries(changed);
    setSelected(to.trim() ? sel.map((t) => (t.toLowerCase() === from.toLowerCase() ? to.trim() : t)) : sel.filter((t) => t.toLowerCase() !== from.toLowerCase()));
    setRenaming(null);
  };

  if (tags.length === 0) {
    return <div class="card"><p class="muted">Noch keine Tags. Beim Eintragen einer Buchung kannst du Tags vergeben, z. B. „Urlaub Frankreich“ oder „Geburtstag“. In der Schnelleingabe geht auch #Urlaub. Hier wertest du sie danach aus.</p></div>;
  }

  return (
    <>
      <div class="card">
        <div class="lbl">Tags (antippen zum Filtern)</div>
        <div class="chips">
          {tags.map((t) => {
            const on = sel.some((x) => x.toLowerCase() === t.tag.toLowerCase());
            return <button class={`chip big ${on ? 'on-chip' : ''}`} aria-pressed={on} onClick={() => toggle(t.tag)}>#{t.tag} · {money(t.expenseCents)}</button>;
          })}
        </div>
        {sel.length > 1 && <p class="hint">Es werden nur Buchungen gezeigt, die <strong>alle</strong> gewählten Tags tragen.</p>}
      </div>

      {sel.length > 0 && (
        <>
          <div class="card highlight">
            <div class="lbl">{sel.map((t) => `#${t}`).join(' + ')}</div>
            <p class="big"><strong>{money(sum.expenseCents)}</strong> ausgegeben</p>
            <p class="hint">
              {sum.count} Buchung{sum.count === 1 ? '' : 'en'}{sum.firstDate && sum.lastDate ? ` · ${formatDate(sum.firstDate)}${sum.firstDate !== sum.lastDate ? ` bis ${formatDate(sum.lastDate)}` : ''}` : ''}
              {sum.incomeCents > 0 ? ` · Einnahmen ${money(sum.incomeCents)}` : ''}
            </p>
            <p class="hint">Anteile: {names[0]} {money(sum.share[0])} · {names[1]} {money(sum.share[1])}</p>
          </div>

          {sum.byCategory.length > 0 && (
            <div class="card">
              <div class="lbl">Nach Kategorie</div>
              <table class="grid"><tbody>{sum.byCategory.map((c) => <tr><td>{c.category}</td><td>{money(c.cents)}</td></tr>)}</tbody></table>
            </div>
          )}

          <div class="card">
            <div class="lbl">Buchungen</div>
            <ul class="list">
              {filtered.map((e) => (
                <li key={e.id}>
                  <button class="item" onClick={() => onEditEntry(e)}>
                    <span class="main">
                      <span class="title">{e.description || e.umbau?.trade || '–'}</span>
                      <span class="sub">{formatDate(e.date)} · {e.category} · {names[e.paidBy]}<TagList tags={(e.tags ?? []).filter((t) => !sel.some((s) => s.toLowerCase() === t.toLowerCase()))} /></span>
                    </span>
                    <span class={e.type === 'income' ? 'amt pos' : 'amt'}>{e.type === 'income' ? '+' : '−'}{money(e.amountCents)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {sel.length === 1 && (
            <div class="card">
              <div class="lbl">Tag verwalten</div>
              {renaming === null ? (
                <div class="actions" style="margin-top:0">
                  <button onClick={() => setRenaming(sel[0])}>Umbenennen / zusammenführen</button>
                  <button class="danger" onClick={() => confirm(`Tag „${sel[0]}“ von ${entries.filter((e) => hasTag(e, sel[0])).length} Buchungen entfernen? Die Buchungen bleiben erhalten.`) && doRename(sel[0], '')}>Tag entfernen</button>
                </div>
              ) : (
                <form onSubmit={(ev) => { ev.preventDefault(); const v = (ev.currentTarget as HTMLFormElement).elements.namedItem('newtag') as HTMLInputElement; if (v.value.trim()) doRename(renaming, v.value); }}>
                  <input name="newtag" defaultValue={renaming} autoFocus />
                  <p class="hint">Gibt es den neuen Namen schon, werden beide Tags zusammengeführt.</p>
                  <div class="actions"><button type="button" onClick={() => setRenaming(null)}>Abbrechen</button><span class="spacer" /><button class="primary" type="submit">Umbenennen</button></div>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
