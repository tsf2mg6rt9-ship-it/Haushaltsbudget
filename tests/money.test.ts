import { describe, expect, it } from 'vitest';
import { centsToInput, parseMoney, splitCents } from '../src/logic/money';

describe('parseMoney', () => {
  it.each([
    ['54,20', 5420], ['54', 5400], ['54,2', 5420], ['1.234,56', 123456], ['1.234', 123400], ['54.20', 5420],
    ['12,5 €', 1250], ['€ 7', 700], ['0,99', 99], ['-3,50', -350], ['1.234.567,89', 123456789],
  ])('%s -> %i', (input, expected) => expect(parseMoney(input)).toBe(expected));
  it.each(['', 'abc', '1,234,5', '12,345', '1..2'])('lehnt "%s" ab', (i) => expect(parseMoney(i)).toBeNull());
  it('formatiert für Eingabefelder', () => {
    expect(centsToInput(5420)).toBe('54,20');
    expect(centsToInput(5)).toBe('0,05');
  });
});

describe('splitCents', () => {
  it('Summe bleibt exakt', () => {
    for (const amount of [1, 99, 1001, 33333]) for (const pct of [0, 33.3, 50, 66.67, 100]) {
      const [a, b] = splitCents(amount, pct);
      expect(a + b).toBe(amount);
    }
  });
  it('50/50', () => expect(splitCents(1000, 50)).toEqual([500, 500]));
  it('begrenzt Prozent', () => expect(splitCents(1000, 150)).toEqual([1000, 0]));
});
