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

## Ablauf

1. **Termin:** Kalender mit Monatsnavigation, Auswahl „Ein Tag“ oder „Mehrere Tage“ (zusammenhängend, ohne belegte Tage), Uhrzeit von/bis.
2. **Anlass:** Seminar & Workshop, Teamtag & Retreat, Private Feier, Etwas anderes. Dazu Personenzahl, optionale Wünsche und die Option „Wir möchten auch im HØV übernachten“.
3. **Kontakt:** Name und E-Mail sind Pflicht, Unternehmen und Telefon optional. Darunter eine Übersicht aller Angaben mit „Ändern“, dann „Unverbindlich anfragen“ und anschließend eine beispielhafte Bestätigung.

Eingaben bleiben beim Wechsel zwischen den Schritten erhalten, auch bei Browser-Zurück und Neuladen (`sessionStorage` des Tabs; wird nach dem Absenden gelöscht). Jeder Schritt hat einen eigenen URL-Hash (`#termin`, `#anlass`, `#kontakt`). Ein Direktaufruf eines späteren Schritts ohne gültige Vorangaben führt zum ersten unvollständigen Schritt.

## Einbettung

`/embed` zeigt die Strecke ohne Header und Footer:

```html
<iframe src="https://<domain>/embed" title="Anfrage SPACE im HØV" style="width:100%;border:0"></iframe>
<script>
  window.addEventListener("message", (e) => {
    if (e.data?.type === "space-anfrage:height") document.querySelector("iframe").style.height = e.data.height + "px";
  });
</script>
```

Welche Seiten einbetten dürfen, steuert `EMBED_FRAME_ANCESTORS` (CSP `frame-ancestors`). Alle anderen Seiten sind nur für dieselbe Domain einbettbar.

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
