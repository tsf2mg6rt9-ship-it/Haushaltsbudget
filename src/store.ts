import { useEffect, useState } from 'preact/hooks';
import * as db from './db';
import { DEFAULT_SETTINGS } from './logic/backup';
import type { Entry, Recurring, Settings } from './logic/types';

export interface State {
  ready: boolean;
  settings: Settings;
  entries: Entry[];
  recurring: Recurring[];
  /** Fehlermeldung, falls IndexedDB nicht nutzbar ist (z. B. privater Modus) */
  dbError: string | null;
}

let state: State = { ready: false, settings: DEFAULT_SETTINGS, entries: [], recurring: [], dbError: null };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const getState = (): State => state;

export function useStore(): State {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return state;
}

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

async function guard(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    set({ dbError: `Speichern nicht möglich: ${e instanceof Error ? e.message : String(e)}` });
  }
}

export async function init() {
  try {
    const [entries, recurring, settings] = await Promise.all([
      db.getAll<Entry>('entries'),
      db.getAll<Recurring>('recurring'),
      db.getMeta<Settings>('settings'),
    ]);
    set({ ready: true, entries, recurring, settings: { ...DEFAULT_SETTINGS, ...settings } });
  } catch (e) {
    set({ ready: true, dbError: `Lokale Datenbank nicht verfügbar: ${e instanceof Error ? e.message : String(e)}. Daten gehen beim Schließen verloren.` });
  }
}

export const saveEntry = (e: Entry) =>
  guard(async () => {
    const exists = state.entries.some((x) => x.id === e.id);
    set({ entries: exists ? state.entries.map((x) => (x.id === e.id ? e : x)) : [...state.entries, e] });
    await db.put('entries', e);
  });
/** Mehrere Buchungen in einer Transaktion speichern (alles oder nichts). */
export const saveEntries = (es: Entry[]) =>
  guard(async () => {
    await db.putMany('entries', es);
    set({ entries: [...state.entries, ...es] });
  });
/** Mehrere vorhandene Buchungen ersetzen (z. B. Tag umbenennen). */
export const upsertEntries = (es: Entry[]) =>
  guard(async () => {
    const byId = new Map(es.map((e) => [e.id, e]));
    set({ entries: state.entries.map((e) => byId.get(e.id) ?? e) });
    await db.putMany('entries', es);
  });
export const deleteEntries = (ids: string[]) =>
  guard(async () => {
    const drop = new Set(ids);
    set({ entries: state.entries.filter((x) => !drop.has(x.id)) });
    await db.removeMany('entries', ids);
  });
export const deleteEntry = (id: string) =>
  guard(async () => {
    set({ entries: state.entries.filter((x) => x.id !== id) });
    await db.remove('entries', id);
  });
export const saveRecurring = (r: Recurring) =>
  guard(async () => {
    const exists = state.recurring.some((x) => x.id === r.id);
    set({ recurring: exists ? state.recurring.map((x) => (x.id === r.id ? r : x)) : [...state.recurring, r] });
    await db.put('recurring', r);
  });
export const deleteRecurring = (id: string) =>
  guard(async () => {
    set({ recurring: state.recurring.filter((x) => x.id !== id) });
    await db.remove('recurring', id);
  });
export const saveSettings = (patch: Partial<Settings>) =>
  guard(async () => {
    const settings = { ...state.settings, ...patch };
    set({ settings });
    await db.setMeta('settings', settings);
  });
export const replaceAll = (settings: Settings, entries: Entry[], recurring: Recurring[]) =>
  guard(async () => {
    set({ settings, entries, recurring });
    await db.replaceAll(settings, entries, recurring);
  });
