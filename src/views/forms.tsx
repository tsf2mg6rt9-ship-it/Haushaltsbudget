import { useState } from 'preact/hooks';
import { centsToInput, formatMoney, parseMoney, splitCents } from '../logic/money';
import { isValidISO, isValidYM } from '../logic/dates';
import { monthlyCents } from '../logic/calc';
import type { Entry, Recurring, Rhythm, Settings } from '../logic/types';
import { Field, Modal, Seg } from './ui';

function SharePicker({ pct, onChange, names }: { pct: number; onChange: (n: number) => void; names: [string, string] }) {
  const preset = pct === 50 ? 'half' : pct === 100 ? 'p1' : pct === 0 ? 'p2' : 'custom';
  return (
    <div>
      <Seg
        value={preset}
        onChange={(v) => onChange(v === 'half' ? 50 : v === 'p1' ? 100 : v === 'p2' ? 0 : pct === 50 || pct === 0 || pct === 100 ? 60 : pct)}
        options={[
          { value: 'half', label: '50/50' },
          { value: 'p1', label: `nur ${names[0]}` },
          { value: 'p2', label: `nur ${names[1]}` },
          { value: 'custom', label: 'Andere' },
        ]}
      />
      {preset === 'custom' && (
        <div class="row" style="margin-top:8px">
          <input type="range" min="0" max="100" step="1" value={pct} onInput={(e) => onChange(+e.currentTarget.value)} />
          <span class="pct">{pct} % / {100 - pct} %</span>
        </div>
      )}
    </div>
  );
}

export function EntryForm({
  initial, settings, umbauMode, onSave, onDelete, onClose,
}: {
  initial: Entry;
  settings: Settings;
  umbauMode?: boolean;
  onSave: (e: Entry) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [e, setE] = useState<Entry>(initial);
  const [amount, setAmount] = useState(initial.amountCents ? centsToInput(initial.amountCents) : '');
  const [err, setErr] = useState('');
  const names = settings.names;
  const isUmbau = !!e.umbau;
  const patch = (p: Partial<Entry>) => setE((x) => ({ ...x, ...p }));
  const cents = parseMoney(amount);
  const [s1, s2] = splitCents(cents ?? 0, e.share1Pct);

  const submit = (ev: Event) => {
    ev.preventDefault();
    if (cents === null || cents <= 0) return setErr('Bitte einen gültigen Betrag eingeben (z. B. 54,20).');
    if (!isValidISO(e.date)) return setErr('Bitte ein gültiges Datum wählen.');
    const out: Entry = { ...e, amountCents: cents, description: e.description.trim() };
    if (!out.description && !out.umbau) return setErr('Bitte eine Beschreibung eingeben.');
    onSave(out);
  };

  return (
    <Modal title={initial.description || initial.amountCents ? (umbauMode ? 'Rechnung bearbeiten' : 'Buchung bearbeiten') : umbauMode ? 'Neue Umbau-Rechnung' : 'Neue Buchung'} onClose={onClose}>
      <form onSubmit={submit}>
        {!umbauMode && (
          <Seg value={e.type} onChange={(type) => patch({ type })} options={[{ value: 'expense', label: 'Ausgabe' }, { value: 'income', label: 'Einnahme' }]} />
        )}
        <Field label="Betrag (€)">
          <input inputMode="decimal" autocomplete="off" placeholder="0,00" value={amount} onInput={(ev) => setAmount(ev.currentTarget.value)} />
        </Field>
        <Field label="Datum" hint={umbauMode ? 'Rechnungsdatum bzw. geplanter Zahlungstermin' : undefined}>
          <input type="date" value={e.date} onInput={(ev) => patch({ date: ev.currentTarget.value })} />
        </Field>
        {isUmbau && e.umbau && (
          <>
            <Field label="Gewerk / Firma">
              <input list="trades" placeholder="z. B. Elektriker" value={e.umbau.trade} onInput={(ev) => patch({ umbau: { ...e.umbau!, trade: ev.currentTarget.value } })} />
            </Field>
            <Field label="Rechnungsnummer (optional)">
              <input value={e.umbau.invoiceNo ?? ''} onInput={(ev) => patch({ umbau: { ...e.umbau!, invoiceNo: ev.currentTarget.value || undefined } })} />
            </Field>
            <Seg
              value={e.umbau.paid ? 'paid' : 'open'}
              onChange={(v) => patch({ umbau: { ...e.umbau!, paid: v === 'paid' } })}
              options={[{ value: 'paid', label: 'Bezahlt' }, { value: 'open', label: 'Offen / geplant' }]}
            />
          </>
        )}
        <Field label={isUmbau ? 'Beschreibung (optional)' : 'Beschreibung'}>
          <input autocomplete="off" placeholder={e.type === 'income' ? 'z. B. Gehalt' : 'z. B. Billa'} value={e.description} onInput={(ev) => patch({ description: ev.currentTarget.value })} />
        </Field>
        {!isUmbau && (
          <Field label="Kategorie">
            <select value={e.category} onChange={(ev) => patch({ category: ev.currentTarget.value })}>
              {[...new Set([...settings.categories, e.category])].map((c) => <option>{c}</option>)}
            </select>
          </Field>
        )}
        {e.type === 'expense' ? (
          <>
            <div class="lbl" style="margin-top:12px">Aufteilung</div>
            <SharePicker pct={e.share1Pct} onChange={(share1Pct) => patch({ share1Pct })} names={names} />
            {cents ? <div class="hint">{names[0]}: {formatMoney(s1)} · {names[1]}: {formatMoney(s2)}</div> : null}
            <div class="lbl" style="margin-top:12px">Bezahlt von</div>
            <Seg value={e.paidBy} onChange={(paidBy) => patch({ paidBy })} options={[{ value: 0, label: names[0] }, { value: 1, label: names[1] }]} />
          </>
        ) : (
          <>
            <div class="lbl" style="margin-top:12px">Einnahme für</div>
            <Seg value={e.paidBy} onChange={(paidBy) => patch({ paidBy })} options={[{ value: 0, label: names[0] }, { value: 1, label: names[1] }]} />
            <div class="hint">Einnahmen werden nie in den Ausgleich eingerechnet.</div>
          </>
        )}
        <Field label="Notiz (optional)">
          <input value={e.note ?? ''} onInput={(ev) => patch({ note: ev.currentTarget.value || undefined })} />
        </Field>
        {err && <div class="error" role="alert">{err}</div>}
        <div class="actions">
          {onDelete && <button type="button" class="danger" onClick={() => confirm('Diesen Eintrag löschen?') && onDelete()}>Löschen</button>}
          <span class="spacer" />
          <button type="button" onClick={onClose}>Abbrechen</button>
          <button type="submit" class="primary">Speichern</button>
        </div>
      </form>
    </Modal>
  );
}

export function RecurringForm({
  initial, settings, onSave, onDelete, onClose,
}: {
  initial: Recurring;
  settings: Settings;
  onSave: (r: Recurring) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [r, setR] = useState<Recurring>(initial);
  const [amount, setAmount] = useState(initial.amountCents ? centsToInput(initial.amountCents) : '');
  const [err, setErr] = useState('');
  const names = settings.names;
  const patch = (p: Partial<Recurring>) => setR((x) => ({ ...x, ...p }));
  const cents = parseMoney(amount);
  const perMonth = cents ? monthlyCents({ amountCents: cents, rhythm: r.rhythm }) : 0;

  const submit = (ev: Event) => {
    ev.preventDefault();
    if (cents === null || cents <= 0) return setErr('Bitte einen gültigen Betrag eingeben.');
    if (!r.label.trim()) return setErr('Bitte eine Bezeichnung eingeben.');
    if (r.from && !isValidYM(r.from)) return setErr('„Ab“ ist ungültig.');
    if (r.to && !isValidYM(r.to)) return setErr('„Bis“ ist ungültig.');
    if (r.from && r.to && r.from > r.to) return setErr('„Ab“ liegt nach „Bis“.');
    onSave({ ...r, label: r.label.trim(), amountCents: cents });
  };

  return (
    <Modal title={initial.label ? 'Fixposten bearbeiten' : r.type === 'income' ? 'Neue feste Einnahme' : 'Neue Fixkost'} onClose={onClose}>
      <form onSubmit={submit}>
        <Seg value={r.type} onChange={(type) => patch({ type })} options={[{ value: 'expense', label: 'Fixkost' }, { value: 'income', label: 'Feste Einnahme' }]} />
        <Field label="Bezeichnung">
          <input autocomplete="off" placeholder={r.type === 'income' ? 'z. B. Gehalt' : 'z. B. Miete'} value={r.label} onInput={(ev) => patch({ label: ev.currentTarget.value })} />
        </Field>
        <Field label="Kategorie">
          <select value={r.category} onChange={(ev) => patch({ category: ev.currentTarget.value })}>
            {[...new Set([...settings.categories, r.category])].map((c) => <option>{c}</option>)}
          </select>
        </Field>
        <Field label="Betrag je Zahlung (€)">
          <input inputMode="decimal" placeholder="0,00" value={amount} onInput={(ev) => setAmount(ev.currentTarget.value)} />
        </Field>
        <div class="lbl">Rhythmus</div>
        <Seg value={r.rhythm} onChange={(rhythm: Rhythm) => patch({ rhythm })} options={[{ value: 'monthly', label: 'Monatlich' }, { value: 'quarterly', label: 'Quartal' }, { value: 'yearly', label: 'Jährlich' }]} />
        {r.rhythm !== 'monthly' && cents ? <div class="hint">Wird automatisch auf {formatMoney(perMonth)} pro Monat umgelegt (Betrag ÷ {r.rhythm === 'yearly' ? 12 : 3}).</div> : null}
        <div class="two">
          <Field label="Ab Monat (optional)">
            <input type="month" value={r.from ?? ''} onInput={(ev) => patch({ from: ev.currentTarget.value || undefined })} />
          </Field>
          <Field label="Bis Monat (optional)">
            <input type="month" value={r.to ?? ''} onInput={(ev) => patch({ to: ev.currentTarget.value || undefined })} />
          </Field>
        </div>
        <div class="hint">Leer = unbegrenzt.</div>
        {r.type === 'expense' ? (
          <>
            <div class="lbl" style="margin-top:12px">Aufteilung</div>
            <SharePicker pct={r.share1Pct} onChange={(share1Pct) => patch({ share1Pct })} names={names} />
            <div class="lbl" style="margin-top:12px">Bezahlt von</div>
            <Seg value={r.paidBy} onChange={(paidBy) => patch({ paidBy })} options={[{ value: 0, label: names[0] }, { value: 1, label: names[1] }]} />
          </>
        ) : (
          <>
            <div class="lbl" style="margin-top:12px">Einnahme für</div>
            <Seg value={r.paidBy} onChange={(paidBy) => patch({ paidBy })} options={[{ value: 0, label: names[0] }, { value: 1, label: names[1] }]} />
          </>
        )}
        {err && <div class="error" role="alert">{err}</div>}
        <div class="actions">
          {onDelete && <button type="button" class="danger" onClick={() => confirm('Diesen Fixposten löschen? Er verschwindet aus allen Monaten.') && onDelete()}>Löschen</button>}
          <span class="spacer" />
          <button type="button" onClick={onClose}>Abbrechen</button>
          <button type="submit" class="primary">Speichern</button>
        </div>
      </form>
    </Modal>
  );
}
