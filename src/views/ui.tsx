import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { colorForCategory } from '../logic/colors';
import { normalizeTags, parseTagInput } from '../logic/tags';
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

export function TagList({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) return null;
  return <>{tags.map((t) => <span class="tagpill">#{t}</span>)}</>;
}

export function TagInput({ value, onChange, suggestions }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[] }) {
  const [text, setText] = useState('');
  const commit = () => {
    const add = parseTagInput(text);
    if (add.length) onChange(normalizeTags([...value, ...add]));
    setText('');
  };
  const free = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 8);
  return (
    <div>
      {value.length > 0 && (
        <div class="chips" style="margin-bottom:8px">
          {value.map((t) => (
            <button type="button" class="chip on-chip" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Tag ${t} entfernen`}>#{t} ✕</button>
          ))}
        </div>
      )}
      <input
        list="taglist" value={text} autocomplete="off" placeholder="z. B. Urlaub Frankreich"
        onInput={(e) => setText(e.currentTarget.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } }}
      />
      {free.length > 0 && (
        <div class="chips" style="margin-top:8px">
          {free.map((t) => <button type="button" class="chip" onClick={() => onChange(normalizeTags([...value, t]))}>+ {t}</button>)}
        </div>
      )}
    </div>
  );
}

/** Eigene Kategoriefarben (vom App-Wurzelelement bereitgestellt) */
export const ColorsCtx = createContext<Record<string, string>>({});

export function CatDot({ category }: { category: string }) {
  const colors = useContext(ColorsCtx);
  return <i class="catdot" style={`background:${colorForCategory(category, colors)}`} aria-hidden="true" />;
}
