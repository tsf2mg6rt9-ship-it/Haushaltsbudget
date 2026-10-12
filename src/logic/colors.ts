/** Farben für Kategorien. Werden beim Anzeigen aus dem Kategorienamen abgeleitet, gelten also automatisch für alle Buchungen. */
export const PALETTE = [
  '#2f7dd1', '#2e9e6b', '#e08a1e', '#8e5bd0', '#d1495b', '#17a2b8',
  '#c2a21c', '#e0679c', '#6b8e23', '#a0522d', '#3d5a80', '#7a8794',
];

const DEFAULTS: Record<string, string> = {
  Wohnen: '#3d5a80', Lebensmittel: '#2e9e6b', Restaurant: '#e08a1e', Mobilität: '#8e5bd0', Versicherung: '#7a8794',
  Abos: '#17a2b8', Freizeit: '#e0679c', Gesundheit: '#d1495b', Kleidung: '#c2a21c', Haushalt: '#a0522d', Umbau: '#6b8e23',
  Sonstiges: '#9aa5b1', Gehalt: '#2f7dd1', 'Sonstige Einnahmen': '#5aa9e6', Ausgleich: '#8d99a6',
};

export const isHexColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

/** Eigene Farbe > Standardfarbe der Standardkategorien > stabile Farbe aus dem Namen. */
export function colorForCategory(category: string, overrides: Record<string, string> = {}): string {
  const own = overrides[category];
  if (isHexColor(own)) return own;
  return DEFAULTS[category] ?? PALETTE[hashIndex(category.toLowerCase(), PALETTE.length)];
}
