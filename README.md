# Haushaltsbudget (PWA)

Lokale Budget-App für zwei Personen. Alle Daten bleiben im Browser (IndexedDB) – kein Backend, keine Accounts, kein Tracking, keine externen Ressourcen. Nach dem ersten Laden offline nutzbar.

## Entwicklung
```
npm install
npm run dev      # Entwicklungsserver
npm test         # Vitest (Berechnungslogik, Parser, Backup, CSV)
npm run build    # nach dist/ (statisch, relative Pfade)
```

## Deployment (GitHub Pages)
Repo auf GitHub pushen (Branch `main`), unter Settings ▸ Pages „GitHub Actions“ wählen. Der Workflow `.github/workflows/deploy.yml` baut und veröffentlicht automatisch.

## iPhone
Seite in Safari öffnen ▸ Teilen ▸ „Zum Home-Bildschirm“. Nur so schützt iOS die Daten zuverlässig vor dem Löschen. Backups (Mehr ▸ Backup) regelmäßig in iCloud Drive ablegen.

## Struktur
- `src/logic/` – reine, getestete Funktionen (Geld, Monatsberechnung, Ausgleich, Planung, Schnelleingabe-Parser, Backup, CSV)
- `src/db.ts`, `src/store.ts` – IndexedDB und Zustand
- `src/views/` – Oberfläche (Preact)
