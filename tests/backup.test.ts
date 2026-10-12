import { describe, expect, it } from 'vitest';
import { backupAgeDays, backupReminderNeeded, DEFAULT_SETTINGS, makeBackup, parseBackup } from '../src/logic/backup';
import { entriesCSV, toCSV } from '../src/logic/csv';
import type { Entry } from '../src/logic/types';

const e: Entry = { id: 'a', date: '2026-03-01', description: 'Billa; "Frisch"', category: 'Lebensmittel', amountCents: 5420, type: 'expense', share1Pct: 50, paidBy: 0 };

describe('Backup', () => {
  it('Roundtrip', () => {
    const b = makeBackup(DEFAULT_SETTINGS, [e], []);
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok && r.data.entries).toEqual([e]);
  });
  it('lehnt Fremdes ab', () => {
    expect(parseBackup('{').ok).toBe(false);
    expect(parseBackup('{"app":"x"}').ok).toBe(false);
    expect(parseBackup('[]').ok).toBe(false);
  });
  it('überspringt kaputte Einträge', () => {
    const b = { ...makeBackup(DEFAULT_SETTINGS, [e], []), entries: [e, { id: 'b', date: 'kaputt', amountCents: 1 }, null] };
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok && r.skipped).toBe(2);
    expect(r.ok && r.data.entries).toHaveLength(1);
  });
  it('14-Tage-Hinweis', () => {
    const now = new Date('2026-03-20T12:00:00Z');
    expect(backupReminderNeeded(null, true, now)).toBe(true);
    expect(backupReminderNeeded(null, false, now)).toBe(false);
    expect(backupReminderNeeded('2026-03-10T12:00:00Z', true, now)).toBe(false);
    expect(backupReminderNeeded('2026-03-05T11:00:00Z', true, now)).toBe(true);
    expect(backupReminderNeeded('2026-03-06T11:00:00Z', true, now)).toBe(false);
    expect(backupAgeDays('2026-03-10T12:00:00Z', now)).toBe(10);
  });
});

describe('CSV', () => {
  it('escaped Semikolon und Anführungszeichen, BOM, Komma-Dezimal', () => {
    const csv = entriesCSV([e], DEFAULT_SETTINGS);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Billa; ""Frisch"""');
    expect(csv).toContain('54,20');
  });
  it('toCSV', () => expect(toCSV([['a', 'b;c']])).toBe('﻿a;"b;c"\r\n'));
});
