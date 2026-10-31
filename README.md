# SPACE im HØV – Buchungsanfrage

Mobiloptimierte Anfragestrecke für den Veranstaltungsraum **SPACE im HØV** in Altusried (63 m², mit großer Küche), betrieben von **UNIQUE PLACES**.

> **Demomodus:** Belegte Tage sind Beispieldaten. Es gibt noch keine apaleo-Anbindung, keinen E-Mail-Versand und keine Reservierung. Die Oberfläche weist im Demomodus ausdrücklich darauf hin.

## Schnellstart

```bash
npm install
cp .env.example .env.local   # optional, Standard ist BOOKING_DATA_SOURCE=demo
npm run dev                  # http://localhost:3000
```

| Befehl              | Zweck                              |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Lokale Vorschau                    |
| `npm run build`     | Produktions-Build (wie auf Vercel) |
| `npm run typecheck` | TypeScript-Prüfung                 |
| `npm test`          | Tests der Datumslogik (Node ≥ 22)  |

Stack: Next.js 16 (App Router), React 19, TypeScript 5.9, zod 4, Schrift Geist (selbst gehostet über das npm-Paket `geist`).

Gestaltung: weißer Hintergrund, Anthrazit `#1E1E1E` für Buttons, Auswahl und Fokus, dezente Grautöne für Linien und Nebenflächen. Belegte Tage sind nicht nur farblich, sondern auch durch Durchstreichung, Schraffur und „×“ gekennzeichnet. Alle Farben stehen als Variablen in `src/app/globals.css`.

## Deployment (Vercel)

| Variable | Pflicht | Wert |
| --- | --- | --- |
| `BOOKING_DATA_SOURCE` | nein | `demo` (Standard, auch wenn nicht gesetzt) |
| `EMBED_ALLOWED_ORIGINS` | für die iframe-Einbindung | z. B. `https://www.beispiel.de` |

Alle übrigen Variablen in `.env.example` (apaleo, E-Mail) werden im Demomodus nicht gelesen.

## Ablauf

1. **Termin:** Kalender mit Monatsnavigation, Auswahl „Ein Tag“ oder „Mehrere Tage“ (zusammenhängend, ohne belegte Tage), Uhrzeit von/bis.
2. **Anlass:** Seminar & Workshop, Teamtag & Retreat, Private Feier, Etwas anderes. Dazu Personenzahl, optionale Wünsche und die Option „Wir möchten auch im HØV übernachten“.
3. **Kontakt:** Name und E-Mail sind Pflicht, Unternehmen und Telefon optional. Darunter eine Übersicht aller Angaben mit „Ändern“, dann „Unverbindlich anfragen“ und anschließend eine beispielhafte Bestätigung.

Eingaben bleiben beim Wechsel zwischen den Schritten erhalten, auch bei Browser-Zurück und Neuladen (`sessionStorage` des Tabs; wird nach dem Absenden gelöscht). Jeder Schritt hat einen eigenen URL-Hash (`#termin`, `#anlass`, `#kontakt`). Ein Direktaufruf eines späteren Schritts ohne gültige Vorangaben führt zum ersten unvollständigen Schritt.

## Einbindung in WordPress/Elementor

Zwei Elementor-Widgets „HTML“:

| Widget | Datei | Seite |
| --- | --- | --- |
| A – kompakte Anfrageleiste | [`docs/elementor-anfrageleiste.html`](docs/elementor-anfrageleiste.html) | SPACE-Präsentationsseite |
| B – vollständiges Formular (iframe) | [`docs/elementor-formular.html`](docs/elementor-formular.html) | `/space-anfrage/` |

**Einstellungen:**
- **Widget A:** `TARGET_URL`, die Adresse der Formularseite (Standard `/space-anfrage/`), steht an genau einer Stelle oben im Skript. Steht die Leiste auf mehreren Seiten, das Widget als globales Elementor-Widget speichern.
- **Widget B:** `APP_ORIGIN` (Vercel-Adresse der App) und `SCROLL_OFFSET` (Höhe eines fixierten Website-Headers).
- **Vercel:** `EMBED_ALLOWED_ORIGINS` auf die Origin der WordPress-Seite setzen und neu deployen.

**Ablauf:**
1. **Leiste:** Ein Datumsfeld öffnet einen Kalender als Popover (Desktop zwei Monate, mobil einer) für einen Tag oder einen zusammenhängenden Zeitraum; der letzte gewählte Tag zählt voll. Dazu kommen das Personenfeld und ein Pfeilbutton. Gültig sind Anfragen ab morgen, Berliner Zeit. Dann öffnet sie im selben Tab `/space-anfrage/?beginn=YYYY-MM-DD[&ende=YYYY-MM-DD]&personen=N`. Personenbezogene Daten kommen nie in die URL.
2. **Widget B:** Es übernimmt ausschließlich `beginn`, `ende` und `personen` und gibt sie an `/embed` weiter. Andere Parameter werden verworfen.
3. **Erneute Prüfung:** Die App prüft die Werte serverseitig, inklusive Belegung. Bis das Ergebnis da ist, zeigt sie „Dein Wunschtermin wird geprüft …“ und keinen Termin als verfügbar.
   - **Frei:** Die App geht direkt zum Schritt „Anlass“ mit dem Hinweis „… ist laut Kalender frei“ und dem Link „Termin ändern“. Die Uhrzeit wird dann im Schritt „Anlass“ abgefragt.
   - **Belegt oder ungültig:** Der Schritt „Termin“ zeigt eine verständliche Meldung. Monat und Ein-/Mehrtagesmodus sind vorausgewählt, die Personenzahl bleibt erhalten.
   - **Ohne Parameter:** Der Ablauf beginnt regulär bei „Termin“.
4. **Vorrang:** URL-Angaben überschreiben gespeicherte Eingaben zu Termin und Personenzahl.

**Höhenanpassung und Absicherung:**
- **Höhe:** Das iframe meldet seine Höhe per `postMessage` bei Schrittwechseln, Fehlern und Größenänderungen.
- **Senden:** Nur an Origins aus `EMBED_ALLOWED_ORIGINS`. Die Elternseite akzeptiert nur Nachrichten von `APP_ORIGIN` aus genau diesem iframe.
- **CSP:** `frame-ancestors` beschränkt die Einbindung auf diese Websites.

## Architektur

```
src/
  lib/                     gemeinsam (Client + Server), ohne Secrets
    dates.ts               Datumslogik, Europe/Berlin, reine Datumswerte
    booking.ts             Fachmodell, Konstanten, zod-Validierung
    availability.ts        API-Antworttypen
  server/                  nur serverseitig ("server-only")
    booking-backend.ts     Schnittstelle BookingBackend + Auswahl der Datenquelle
    demo-backend.ts        BEISPIELDATEN (deterministisch belegte Tage)
    apaleo-backend.ts      Platzhalter mit skizziertem Ablauf
    config.ts              Umgebungsvariablen
  app/
    page.tsx, embed/       Seiten (laden Startdaten serverseitig)
    api/availability       GET belegte Tage je Monat
    api/anfrage            POST Anfrage (erneute Prüfung auf dem Server)
  components/booking/      Oberfläche (Client-Komponenten)
```

Die Oberfläche spricht ausschließlich mit `/api/*`. Für die apaleo-Anbindung reicht es, `apaleo-backend.ts` zu implementieren und `BOOKING_DATA_SOURCE=apaleo` zu setzen. Oberfläche und API-Routen bleiben unverändert.

**Datum und Zeitzone:** Kalendertage sind reine Datumswerte (`YYYY-MM-DD`) in der lokalen Zeit am Veranstaltungsort. „Heute“ wird immer in `Europe/Berlin` bestimmt, unabhängig von der Zeitzone des Browsers oder Servers (Vercel läuft in UTC). `venueDateTimeToIso()` erzeugt Zeitstempel mit korrektem Offset (MEZ/MESZ) für apaleo.

## Sicherheit

- Zugangsdaten nur als serverseitige Umgebungsvariablen (ohne `NEXT_PUBLIC_`). Lokal kommen sie in `.env.local`, auf Vercel in die Project Settings. Alle `.env*`-Dateien außer `.env.example` sind per `.gitignore` ausgeschlossen.
- Der Server prüft jede Anfrage erneut: Schema, Mindestvorlauf, Zeiten und Verfügbarkeit.
- Ein einfaches Honeypot-Feld hält Bots ab.

## Annahmen und offene Punkte

Die folgenden Punkte sind angenommen und zentral in `src/lib/booking.ts` anpassbar:

- Anfragen sind ab morgen möglich (`MIN_LEAD_DAYS = 1`), bis 24 Monate im Voraus.
- Uhrzeiten im 30-Minuten-Raster von 06:00 bis 24:00 Uhr. Bei mehreren Tagen gilt „von“ für den ersten und „bis“ für den letzten Tag.
- Es gibt bewusst keine Kapazitätsgrenze. Die Personenzahl wird nur auf Plausibilität geprüft (ganze Zahl ab 1).
- Vor dem Livegang ergänzen: Datenschutzhinweis bzw. -link, Impressum, Empfänger der Anfragen (E-Mail) und Rate-Limiting für `/api/anfrage`.
