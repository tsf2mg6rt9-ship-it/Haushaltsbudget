import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { formatMoney } from '../logic/money';
import type { Settlement } from '../logic/types';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button type="button" class="ghost" onClick={onClose} aria-label="Schließen">✕</button>
        </header>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="seg" role="radiogroup">
      {options.map((o) => (
        <button type="button" role="radio" aria-checked={o.value === value} class={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ComponentChildren }) {
  return (
    <label class="field">
      <span class="lbl">{label}</span>
      {children}
      {hint && <span class="hint">{hint}</span>}
    </label>
  );
}

export function SettlementText({ s, names }: { s: Settlement; names: [string, string] }) {
  if (s.from === null || s.to === null) return <>Alles ausgeglichen – niemand muss etwas überweisen.</>;
  return (
    <>
      <strong>{names[s.from]}</strong> überweist <strong>{formatMoney(s.amountCents)}</strong> an <strong>{names[s.to]}</strong>
    </>
  );
}

export const money = formatMoney;
