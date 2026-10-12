import { useRef, useState } from 'preact/hooks';
import { entriesToRecategorize, matchRule, suggestMatchTerm } from '../logic/rules';
import { centsToInput, formatMoney, parseMoney, splitCents } from '../logic/money';
import { isValidISO, isValidYM } from '../logic/dates';
import { monthlyCents } from '../logic/calc';
import type { Entry, Recurring, Rhythm, Settings } from '../logic/types';
import { Field, Modal, Seg, TagInput } from './ui';

const MONTH_NAMES = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

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
  initial, settings, allTags, entries, umbauMode, onSave, onDelete, onClose,
}: {
  initial: Entry;
  settings: Settings;
  allTags: string[];
  entries: Entry[];
  umbauMode?: boolean;
  /** `rule`: Kategorie-Regel, die zusätzlich gespeichert und auf bestehende Buchungen angewendet werden soll */
  onSave: (e: Entry, rule?: { match: string; category: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [e, setE] = useState<Entry>(initial);
  const [amount, setAmount] = useState(initial.amountCents ? centsToInput(initial.amountCents) : '');
  const [err, setErr] = useState('');
  const names = settings.names;
  const isUmbau = !!e.umbau;
  const isSettlement = e.type === 'settlement';
  const isExisting = initial.description.trim() !== '';
  const catTouched = useRef(false);
  const [makeRuleChoice, setMakeRuleChoice] = useState<boolean | null>(null);
  const [termInput, setTermInput] = useState<string | null>(null);
  const term = (termInput ?? suggestMatchTerm(e.description)).trim();
  const ruleCapable = !isUmbau && !isSettlement && e.description.trim() !== '' && term !== '';
  const catChanged = ruleCapable && e.category !== initial.category;
  const affected = ruleCapable ? entriesToRecategorize(entries.filter((x) => x.id !== e.id), [{ match: term, category: e.category }]).length : 0;
  // Angebot, wenn die Kategorie geändert wurde – oder wenn andere gleiche Buchungen eine andere Kategorie haben
  const showRuleBox = catChanged || affected > 0;
  const makeRule = makeRuleChoice ?? (catChanged && isExisting);
  const patch = (p: Partial<Entry>) => setE((x) => ({ ...x, ...p }));
  const cents = parseMoney(amount);
  const [s1, s2] = splitCents(cents ?? 0, e.share1Pct);

  const submit = (ev: Event) => {
    ev.preventDefault();
    if (cents === null || cents <= 0) return setErr('Bitte einen gültigen Betrag eingeben (z. B. 54,20).');
    if (!isValidISO(e.date)) return setErr('Bitte ein gültiges Datum wählen.');
    const out: Entry = { ...e, amountCents: cents, description: e.description.trim() };
    if (!out.description && !out.umbau && !isSettlement) return setErr('Bitte eine Beschreibung eingeben.');
    onSave(out, showRuleBox && makeRule ? { match: term, category: e.category } : undefined);
  };

  return (
    <Modal title={initial.type === 'settlement' ? 'Ausgleichszahlung' : initial.description || initial.amountCents ? (umbauMode ? 'Rechnung bearbeiten' : 'Buchung bearbeiten') : umbauMode ? 'Neue Umbau-Rechnung' : 'Neue Buchung'} onClose={onClose}>
      <form onSubmit={submit}>
        {!umbauMode && (
          <Seg
            value={e.type}
            onChange={(type) => patch({ type, category: type === 'settlement' ? 'Ausgleich' : e.category === 'Ausgleich' ? settings.categories[0] ?? 'Sonstiges' : e.category, description: type === 'settlement' && !e.description ? 'Ausgleich' : e.description })}
            options={[{ value: 'expense', label: 'Ausgabe' }, { value: 'income', label: 'Einnahme' }, { value: 'settlement', label: 'Ausgleich' }]}
          />
        )}
        {isSettlement && (
          <p class="hint">Eine Überweisung zwischen euch beiden, z. B. wenn dein Freund dir seinen Anteil zurückzahlt. Sie zählt weder als Einnahme noch als Ausgabe, sondern verringert nur den offenen Ausgleich.</p>
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
        <Field label={isUmbau || isSettlement ? 'Beschreibung (optional)' : 'Beschreibung'}>
          <input autocomplete="off" placeholder={e.type === 'income' ? 'z. B. Gehalt' : 'z. B. Billa'} value={e.description} onInput={(ev) => {
            const description = ev.currentTarget.value;
            const byRule = !isExisting && !catTouched.current ? matchRule(description.toLowerCase(), settings.categoryRules) : '';
            patch(byRule ? { description, category: byRule } : { description });
          }} />
        </Field>
        {!isUmbau && !isSettlement && (
          <Field label="Kategorie">
            <select value={e.category} onChange={(ev) => { catTouched.current = true; patch({ category: ev.currentTarget.value }); }}>
              {[...new Set([...settings.categories, e.category])].map((c) => <option>{c}</option>)}
            </select>
          </Field>
        )}
        {showRuleBox && (
          <div class="rulebox">
            <label class="check" style="margin-top:0">
              <input type="checkbox" checked={makeRule} onChange={(ev) => setMakeRuleChoice(ev.currentTarget.checked)} />
              Immer {e.category}, wenn die Beschreibung dies enthält:
            </label>
            <input value={termInput ?? term} onInput={(ev) => setTermInput(ev.currentTarget.value)} aria-label="Suchbegriff" />
            <span class="hint">{makeRule ? `${affected} weitere bestehende Buchung${affected === 1 ? ' wird' : 'en werden'} umkategorisiert, künftige Importe und Eingaben ebenfalls.` : affected > 0 ? `${affected} andere Buchung${affected === 1 ? ' hat' : 'en haben'} eine andere Kategorie. Häkchen setzen, um sie anzugleichen.` : 'Nur diese eine Buchung wird geändert.'}</span>
          </div>
        )}
        {isSettlement ? (
          <>
            <div class="lbl" style="margin-top:12px">Überwiesen von</div>
            <Seg value={e.paidBy} onChange={(paidBy) => patch({ paidBy })} options={[{ value: 0, label: names[0] }, { value: 1, label: names[1] }]} />
            <div class="hint">{names[e.paidBy]} überweist {cents ? formatMoney(cents) + ' ' : ''}an {names[e.paidBy === 0 ? 1 : 0]}.</div>
          </>
        ) : e.type === 'expense' ? (
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
        <div class="field">
          <span class="lbl">Tags (optional)</span>
          <TagInput value={e.tags ?? []} onChange={(tags) => patch({ tags: tags.length ? tags : undefined })} suggestions={allTags} />
          <span class="hint">z. B. Urlaub, Geburtstag, Frankreich – später filter- und auswertbar.</span>
        </div>
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
    onSave({ ...r, label: r.label.trim(), amountCents: cents, pay14: r.type === 'income' && r.rhythm === 'monthly' ? r.pay14 : undefined });
  };

  return (
    <Modal title={initial.label ? 'Fixposten bearbeiten' : r.type === 'income' ? 'Neue feste Einnahme' : 'Neue Fixkost'} onClose={onClose}>
      <form onSubmit={submit}>
        <Seg value={r.type} onChange={(type) => patch({ type, pay14: type === 'income' ? r.pay14 : undefined })} options={[{ value: 'expense', label: 'Fixkost' }, { value: 'income', label: 'Feste Einnahme' }]} />
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
        <Seg value={r.rhythm} onChange={(rhythm: Rhythm) => patch({ rhythm, dueMonth: rhythm === 'monthly' ? undefined : r.dueMonth, pay14: rhythm === 'monthly' ? r.pay14 : undefined })} options={[{ value: 'monthly', label: 'Monatlich' }, { value: 'quarterly', label: 'Quartal' }, { value: 'yearly', label: 'Jährlich' }]} />
        {r.type === 'income' && r.rhythm === 'monthly' && (
          <div class="rulebox">
            <label class="check" style="margin-top:0">
              <input type="checkbox" checked={!!r.pay14} onChange={(ev) => patch({ pay14: ev.currentTarget.checked || undefined })} />
              14 Gehälter pro Jahr (Österreich)
            </label>
            <span class="hint">
              Das 13. und 14. Gehalt (Urlaubs- und Weihnachtsgeld, z. B. im Juni/Juli und Dezember) werden zusätzlich dazugerechnet und auf 12 Monate verteilt.
              {r.pay14 && cents ? ` Durchschnitt: ${formatMoney(monthlyCents({ amountCents: cents, rhythm: 'monthly', pay14: true }))} pro Monat statt ${formatMoney(cents)}.` : ''} Trage hier den normalen monatlichen Nettobetrag ein.
            </span>
          </div>
        )}
        {r.rhythm !== 'monthly' && (
          <Field label={r.rhythm === 'yearly' ? 'Abbuchung im Monat' : 'Erste Abbuchung im Jahr (dann alle 3 Monate)'} hint="Damit weiß die App, wann die Zahlung wirklich vom Konto geht – und zählt sie beim Kontoauszug-Import nicht zusätzlich.">
            <select value={r.dueMonth ? String(r.dueMonth) : ''} onChange={(ev) => patch({ dueMonth: ev.currentTarget.value ? +ev.currentTarget.value : undefined })}>
              <option value="">– noch unbekannt –</option>
              {MONTH_NAMES.map((m, i) => <option value={String(i + 1)}>{r.rhythm === 'quarterly' ? `${m}, ${MONTH_NAMES[(i + 3) % 12]}, ${MONTH_NAMES[(i + 6) % 12]}, ${MONTH_NAMES[(i + 9) % 12]}` : m}</option>)}
            </select>
          </Field>
        )}
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
