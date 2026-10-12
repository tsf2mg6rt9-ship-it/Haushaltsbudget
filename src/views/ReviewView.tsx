import { formatDate } from '../logic/dates';
import type { Flag } from '../logic/review';
import type { Entry, Settings } from '../logic/types';
import { deleteEntry, saveEntry } from '../store';
import { CatDot, Modal, money } from './ui';

export function ReviewView({ entries, flags, settings, onEdit, onClose }: {
  entries: Entry[];
  flags: Map<string, Flag[]>;
  settings: Settings;
  onEdit: (e: Entry) => void;
  onClose: () => void;
}) {
  const list = entries.filter((e) => flags.has(e.id)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const names = settings.names;
  return (
    <Modal title={`Zu prüfen (${list.length})`} onClose={onClose}>
      <p class="muted">Diese Buchungen sehen verdächtig aus, z. B. weil sie doppelt gezählt werden könnten. Prüfe sie einzeln: Ist alles in Ordnung, tippst du auf „Ist okay“.</p>
      {list.length === 0 && <p class="big">Alles geprüft – nichts Verdächtiges mehr.</p>}
      <ul class="list">
        {list.map((e) => {
          const fl = flags.get(e.id) ?? [];
          return (
            <li key={e.id}>
              <div class="review">
                <div class="item" style="padding-bottom:2px">
                  <span class="main">
                    <span class="title"><CatDot category={e.category} />{e.description || '–'}</span>
                    <span class="sub">{formatDate(e.date)} · {e.category} · {e.type === 'income' ? `Einnahme für ${names[e.paidBy]}` : `${names[e.paidBy]} zahlte`}</span>
                  </span>
                  <span class={e.type === 'income' ? 'amt pos' : 'amt'}>{e.type === 'income' ? '+' : '−'}{money(e.amountCents)}</span>
                </div>
                {fl.map((f) => <div class="flagtext">⚠ {f.text}</div>)}
                <div class="actions" style="margin-top:6px">
                  <button onClick={() => saveEntry({ ...e, checked: true })}>Ist okay</button>
                  {fl.some((f) => f.kind === 'partner') && (
                    <button onClick={() => saveEntry({
                      ...e, type: 'settlement', category: 'Ausgleich', share1Pct: 50, checked: undefined,
                      // Einnahme für X = der andere hat überwiesen; Ausgabe von X = X hat überwiesen
                      paidBy: e.type === 'income' ? (e.paidBy === 0 ? 1 : 0) : e.paidBy,
                    })}>Als Ausgleich erfassen</button>
                  )}
                  <button onClick={() => onEdit(e)}>Bearbeiten</button>
                  <button class="danger" onClick={() => confirm('Diese Buchung löschen?') && deleteEntry(e.id)}>Löschen</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
