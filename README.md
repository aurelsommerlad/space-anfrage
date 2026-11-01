# SPACE im HØV – Buchungsanfrage

Mobiloptimierte Anfragestrecke für den Veranstaltungsraum **SPACE im HØV** in Altusried (63 m², mit großer Küche), betrieben von **UNIQUE PLACES**.

Zwei Betriebsarten (`BOOKING_MODE`):

- **demo:** Belegte Tage sind Beispieldaten. Nichts wird gespeichert, versendet oder reserviert. Die Oberfläche weist ausdrücklich darauf hin.
- **live:** Verfügbarkeit aus apaleo (nur lesend). Anfragen werden mit Referenznummer in Postgres gespeichert. Es gehen eine interne Benachrichtigung und eine Eingangsbestätigung per E-Mail (Resend) raus. Eine Reservierung entsteht nicht.

Ist `live` gesetzt, aber unvollständig konfiguriert, ist die Strecke gesperrt (Hinweis auf stay@unique-places.com). Es gibt **keinen** stillen Rückfall auf Demo.

## Schnellstart

```bash
npm install
cp .env.example .env.local   # optional, Standard ist BOOKING_MODE=demo
npm run dev                  # http://localhost:3000
```

| Befehl              | Zweck                              |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Lokale Vorschau                    |
| `npm run build`     | Produktions-Build (wie auf Vercel) |
| `npm run typecheck` | TypeScript-Prüfung                 |
| `npm run db:migrate` | Datenbankschema anlegen/aktualisieren |
| `npm test`          | Tests der Datumslogik (Node ≥ 22)  |
| `tests/abnahme/`    | Abnahmetests für den Live-Modus (siehe unten) |

Stack: Next.js 16 (App Router), React 19, TypeScript 5.9, zod 4, postgres.js.

Gestaltung: weißer Hintergrund, Anthrazit `#1E1E1E` für Buttons, Auswahl und Fokus, dezente Grautöne für Linien und Nebenflächen. Belegte Tage sind nicht nur farblich, sondern auch durch Durchstreichung, Schraffur und „×“ gekennzeichnet. Alle Farben stehen als Variablen in `src/app/globals.css`.

## Typografie

Angeglichen an unique-places.com (globale Elementor-Stile):
- **Roboto:** Fließtext 300, Beschriftungen und Buttons 400.
- **Josefin Sans 400:** Überschriften.
- **Akzentzeilen:** Roboto 400, 12 px, Versalien, 1 px Laufweite.

Die Schriften sind selbst gehostet (`src/app/fonts/`, SIL Open Font License) und werden über `next/font/local` eingebunden (`src/app/fonts.ts`). Es gibt keine externe Schriftanbindung.

Alle Schriftgrößen, Schnitte und Laufweiten stehen zentral als Variablen in `src/app/globals.css` (Abschnitt „Typografie“). Die Komponenten verwenden nur diese Variablen.

Die kompakte Anfrageleiste übernimmt die Textschrift der Website über `--e-global-typography-text-font-family` und erbt sonst die Schrift der Umgebung. Felder, Buttons und Kalender verwenden dieselbe Schrift.

## Deployment (Vercel)

### Benötigte Dienste (live)

| Dienst | Zweck | Einrichtung |
| --- | --- | --- |
| **apaleo** | Verfügbarkeit der SPACE (Property `ALTUS`, Kategorie `ALTUS-SPACE`) | Eigene App/Client-Credentials **nur mit Scope `availability.read`**. Es werden keine Buchungen oder Sperren erzeugt. |
| **Postgres** (z. B. Neon über den Vercel Marketplace, Region Frankfurt) | Anfragen, E-Mail-Protokoll, Rate-Limit | Je Umgebung eine eigene Datenbank. Tabellen legt die App selbst an. |
| **Resend** (Region EU) | Interne Benachrichtigung und Eingangsbestätigung | Absenderdomain verifizieren (SPF, DKIM per DNS; DMARC empfohlen). Einen API-Key mit „Sending access“ nur für diese Domain anlegen. |
| **Vercel** | Hosting, Cron für E-Mail-Wiederholung | Variablen getrennt für Preview und Production. Den Cron führt Vercel nur in Production aus. |

### Umgebungsvariablen

| Variable | Pflicht (live) | Inhalt |
| --- | --- | --- |
| `BOOKING_MODE` | ja | `demo` oder `live` (ohne Wert: `demo`; altes `BOOKING_DATA_SOURCE` wird weiter verstanden) |
| `APALEO_CLIENT_ID`, `APALEO_CLIENT_SECRET` | ja | apaleo-Client (Scope `availability.read`) |
| `APALEO_PROPERTY_ID` | ja | `ALTUS` |
| `APALEO_UNIT_GROUP_ID` | ja | `ALTUS-SPACE` |
| `DATABASE_URL` | ja | Postgres-Verbindung (TLS) |
| `RESEND_API_KEY` | ja | Resend-API-Key |
| `MAIL_FROM` | ja | Absender auf der verifizierten Domain, z. B. `SPACE im HØV <anfrage@…>` |
| `MAIL_INTERNAL_TO` | ja | `stay@unique-places.com` |
| `MAIL_REPLY_TO` | empfohlen | Antwortadresse der Bestätigung, z. B. `stay@unique-places.com` |
| `REQUEST_HASH_SECRET` | ja | Zufallswert ≥ 32 Zeichen (Pseudonymisierung von IP-Adressen) |
| `ADMIN_USER`, `ADMIN_PASSWORD` | für `/intern` | Zugang zur internen Übersicht (Passwort ≥ 12 Zeichen) |
| `CRON_SECRET` | empfohlen | ≥ 16 Zeichen, schützt die E-Mail-Wiederholung |
| `PRIVACY_URL` | nein | Standard `https://unique-places.com/datenschutz` |
| `EMBED_ALLOWED_ORIGINS` | für die Einbindung | `https://unique-places.com https://www.unique-places.com` (beim Build gelesen) |
| `MAIL_TRANSPORT`, `APALEO_API_URL`, `APALEO_IDENTITY_URL`, `RESEND_API_URL` | nein | Nur für Tests. `MAIL_TRANSPORT=log` und `http://`-Adressen sind in Production gesperrt. |

**Vorgehen:** Schritt für Schritt in [`docs/live-einrichtung.md`](docs/live-einrichtung.md), inklusive `BOOKING_MODE` gegenüber `BOOKING_DATA_SOURCE`:
1. Einrichten, während Production noch im Demomodus läuft.
2. Im geschützten Selbsttest `/intern/selbsttest` prüfen (Datenbank, apaleo, Resend; ohne Anzeige von Geheimnissen).
3. Mit `BOOKING_MODE=live` umschalten.

## Ablauf

1. **Termin:** Kalender mit Monatsnavigation, Auswahl „Ein Tag“ oder „Mehrere Tage“ (zusammenhängend, ohne belegte Tage), Uhrzeit von/bis.
2. **Anlass:** Seminar & Workshop, Teamtag & Retreat, Private Feier, Etwas anderes. Dazu Personenzahl, optionale Wünsche und die Option „Wir möchten auch im HØV übernachten“.
3. **Kontakt:** Name und E-Mail sind Pflicht, Unternehmen und Telefon optional. Darunter eine Übersicht aller Angaben mit „Ändern“, dann „Unverbindlich anfragen“. Darüber steht ein Datenschutzhinweis mit Link. Die Bestätigung mit Anfragenummer erscheint erst, wenn die Anfrage gespeichert ist (im Demomodus eine beispielhafte Bestätigung).

Eingaben bleiben beim Wechsel zwischen den Schritten erhalten, auch bei Browser-Zurück und Neuladen (`sessionStorage` des Tabs; wird nach dem Absenden gelöscht). Jeder Schritt hat einen eigenen URL-Hash (`#termin`, `#anlass`, `#kontakt`). Ein Direktaufruf eines späteren Schritts ohne gültige Vorangaben führt zum ersten unvollständigen Schritt.

## Einbindung in WordPress/Elementor

Zwei Elementor-Widgets „HTML“:

| Widget | Datei | Seite |
| --- | --- | --- |
| A – kompakte Anfrageleiste | [`docs/elementor-anfrageleiste.html`](docs/elementor-anfrageleiste.html) | SPACE-Präsentationsseite |
| B – vollständiges Formular (iframe) | [`docs/elementor-formular.html`](docs/elementor-formular.html) | `/space-anfrage/` |

**Einstellungen:**
- **Widget A:** Leiste als HTML/CSS im Widget, der Kalender wird als Datei `https://<app>/anfrageleiste.js` (aus `public/anfrageleiste.js`) per `<script src>` geladen. So kann WordPress den Skriptcode nicht verändern, und Änderungen am Kalender erfordern nur ein Vercel-Deployment. Einstellungen im `<form>` des Widgets: `action` (Adresse der Formularseite, Standard `/space-anfrage/`) und `data-header-offset` (Höhe eines fixierten Website-Headers). Ohne Skript bleibt die Leiste sichtbar; der Button sendet dann nur die Personenzahl. Prüfen im Browser: `window.SpaceAnfrageKalender` und `data-sa-ready="8"` am `<form>`.
- **Widget B:** `APP_ORIGIN` (Vercel-Adresse der App) und `SCROLL_OFFSET` (Höhe eines fixierten Website-Headers).
- **Vercel:** `EMBED_ALLOWED_ORIGINS` auf die Origin der WordPress-Seite setzen und neu deployen.

**Ablauf:**
1. **Leiste:** Ein Datumsfeld öffnet einen Kalender als Popover (Desktop zwei Monate, mobil einer) für einen Tag oder einen zusammenhängenden Zeitraum; der letzte gewählte Tag zählt voll. Dazu kommen das Personenfeld und der Button „Unverbindlich anfragen“. Die Aufteilung richtet sich nach der Breite der Leiste: ab 510 px eine Zeile (bis 569 px kompakter, ohne Kalendersymbol), darunter Datum oben und Personen/Button darunter, unter 334 px der Button in eigener Zeile über die volle Breite. Gültig sind Anfragen ab morgen, Berliner Zeit. Dann öffnet sie im selben Tab `/space-anfrage/?beginn=YYYY-MM-DD[&ende=YYYY-MM-DD]&personen=N`. Personenbezogene Daten kommen nie in die URL.
2. **Widget B:** Es übernimmt ausschließlich `beginn`, `ende` und `personen` und gibt sie an `/embed` weiter. Andere Parameter werden verworfen.
3. **Erneute Prüfung:** Die App prüft die Werte serverseitig, inklusive Belegung. Bis das Ergebnis da ist, zeigt sie „Dein Wunschtermin wird geprüft …“ und keinen Termin als verfügbar.
   - **Frei:** Die App geht direkt zum Schritt „Anlass“ mit dem Hinweis „… ist laut Kalender frei“ und dem Link „Termin ändern“. Die Uhrzeit wird dann im Schritt „Anlass“ abgefragt.
   - **Belegt oder ungültig:** Der Schritt „Termin“ zeigt eine verständliche Meldung. Monat und Ein-/Mehrtagesmodus sind vorausgewählt, die Personenzahl bleibt erhalten.
   - **Ohne Parameter:** Der Ablauf beginnt regulär bei „Termin“.
4. **Vorrang:** URL-Angaben überschreiben gespeicherte Eingaben zu Termin und Personenzahl.

**Mitlaufende Zusammenfassung im iframe:** Das iframe passt seine Höhe an und scrollt selbst nicht, daher greift `position: sticky` dort nicht. Widget B meldet deshalb die Scrollposition der WordPress-Seite und die Höhe des fixierten Website-Headers (automatisch erkannt, `HEADER_OFFSET`) per `postMessage` (`space-anfrage:viewport`). Das Formular verschiebt die Zusammenfassung innerhalb ihrer Spalte, bis zum Ende des Formularbereichs. Ohne diese Meldungen bleibt sie einfach an ihrem Platz.

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
    config.ts              Betriebsart und Umgebungsvariablen (demo / live / gesperrt)
    booking-backend.ts     Auswahl der Datenquelle
    demo-backend.ts        BEISPIELDATEN (deterministisch belegte Tage)
    apaleo-backend.ts      apaleo-Verfügbarkeit (nur lesend)
    db.ts, requests.ts     Postgres: Anfragen, Duplikaterkennung, Rate-Limit
    mail.ts                E-Mails (Resend) mit Protokoll und Wiederholung
    log.ts                 Protokoll ohne vollständige personenbezogene Daten
  proxy.ts                 Basic Auth für /intern
  app/
    page.tsx, embed/       Seiten (laden Startdaten serverseitig)
    api/availability       GET belegte Tage je Monat
    api/anfrage            POST Anfrage
    intern/                geschützte Übersicht der Anfragen
    api/intern/…           Status ändern, E-Mails erneut senden
    api/cron/mail-retry    tägliche Wiederholung fehlgeschlagener E-Mails
  components/booking/      Oberfläche (Client-Komponenten)
```

Die Oberfläche spricht ausschließlich mit `/api/*`, nie direkt mit apaleo.

**apaleo-Verfügbarkeit** (`GET /availability/v1/unit-groups`): Die Konfiguration von `ALTUS` wurde lesend abgeglichen:
- Zeitscheibe `ALTUS-DAY`: DayUse, 10–16 Uhr.
- Zeitscheibe `ALTUS-NIGHT`: OverNight, 16–10 Uhr.
- SPACE-Rate: nur DayUse.
- Wartungen können beliebige Zeiten haben.

Ein Tag D gilt nur als frei, wenn **der ganze Kalendertag (00–24 Uhr)** frei ist. Geprüft werden für jeden Tag des Zeitraums, **einschließlich des letzten Tages**:
- OverNight des Vortags (00–10 Uhr),
- DayUse (10–16 Uhr),
- OverNight des Tages (16–24 Uhr).

Damit sind alle wählbaren Zeiten (06–24 Uhr) einschließlich Auf- und Abbau abgedeckt. Die Lückenlosigkeit wird bei jeder Abfrage anhand der Zeitstempel kontrolliert.

„Frei“ heißt: `availableCount ≥ 1`, keine Wartung, keine Block-Belegung. Netzwerkfehler, Zeitüberschreitung (8 s), HTTP-Fehler, unvollständige Antworten, fehlende Tage oder Lücken ergeben **„nicht prüfbar“**, nie „frei“ und nie „belegt“. Der Kalender zeigt nicht prüfbare Tage grau ohne „×“, mit Hinweis und „Erneut versuchen“. Der Kalender nutzt einen Zwischenspeicher von 60 Sekunden. Beim Absenden wird immer frisch geprüft.

**Datenbank:** Das Schema steht versioniert in `src/server/schema.ts`. Anwenden mit `npm run db:migrate -- --ziel=<host>`, oder die App wendet es beim ersten Zugriff automatisch an. Row Level Security ist auf allen Tabellen aktiv. Enthält die Datenbank fremde Tabellen und noch kein SPACE-Schema, wird aus Sicherheitsgründen nichts angelegt. Einrichtung: [`docs/live-einrichtung.md`](docs/live-einrichtung.md).

**Ablauf beim Absenden (live):**
1. Serverseitige Validierung.
2. Spam-Schutz: Honeypot und Mindestausfüllzeit.
3. Rate-Limit: 5 Anfragen je 10 Minuten und 20 je Tag, je pseudonymisierter IP.
4. Frische apaleo-Prüfung.
5. Speichern mit Referenz (`SPACE-JJMM-XXXX`, Status „Neu“).
6. E-Mails versenden.

Der Erfolg wird erst nach dem Speichern gemeldet. Eine fehlgeschlagene E-Mail ändert daran nichts: Sie wird protokolliert und in `/intern` oder per Cron erneut versendet.

**Doppelte Einsendungen:** Jede Anfrage trägt einen im Browser erzeugten Schlüssel. Gleicher Schlüssel (Doppelklick, erneutes Senden nach Netzfehler) oder gleiche E-Mail, gleicher Termin und gleicher Anlass innerhalb von 30 Minuten ergeben dieselbe Referenz. Es entsteht kein zweiter Datensatz und es gehen keine weiteren E-Mails raus.

**Selbsttest:** `/intern/selbsttest` (öffentlich und ohne Geheimnisse auch als `/api/status`) prüft:
- Konfiguration,
- Datenbank (Verbindung, Schema, Row Level Security),
- apaleo (Token, feingranularer Client mit `core.unit_groups_availability.read` oder Scope `availability.read`, lückenlose Verfügbarkeit der nächsten 90 Tage, Gegenprobe: kein Zugriff auf andere Properties),
- Resend (DKIM, SPF, DMARC, Key).

Über Schaltflächen lassen sich das Schema anlegen und eine Test-E-Mail senden. Der Selbsttest läuft auch im Demomodus. Er zeigt keine Geheimnisse an.

**Interne Übersicht:** `https://<app>/intern` (HTTP Basic Auth mit `ADMIN_USER`/`ADMIN_PASSWORD`, `noindex`, `no-store`) listet alle gespeicherten Anfragen mit Status und E-Mail-Status. Je Anfrage gibt es:
- Status und interne Notiz ändern,
- nicht versendete E-Mails erneut senden.

Gespeicherte Anfragen sind nirgends öffentlich abrufbar.

**Datum und Zeitzone:** Kalendertage sind reine Datumswerte (`YYYY-MM-DD`) in der lokalen Zeit am Veranstaltungsort. „Heute“ wird immer in `Europe/Berlin` bestimmt, unabhängig von der Zeitzone des Browsers oder Servers (Vercel läuft in UTC). `venueDateTimeToIso()` erzeugt Zeitstempel mit korrektem Offset (MEZ/MESZ) für apaleo.

## Sicherheit und Datenschutz

- Zugangsdaten nur als serverseitige Umgebungsvariablen (ohne `NEXT_PUBLIC_`). Lokal kommen sie in `.env.local`, auf Vercel in die Project Settings. Alle `.env*`-Dateien außer `.env.example` sind per `.gitignore` ausgeschlossen.
- apaleo wird ausschließlich lesend genutzt (Scope `availability.read`).
- Protokolle enthalten keine Namen, Nachrichten oder Telefonnummern. E-Mail-Adressen sind maskiert (`e***@e***.org`), IP-Adressen nur als HMAC-Pseudonym im Rate-Limit.
- Interne Aktionen prüfen Zugangsdaten und Herkunft (Schutz vor CSRF).
- Ein Textbaustein für die Datenschutzerklärung, passend zu den tatsächlich genutzten Diensten, liegt in [`docs/datenschutz-baustein.md`](docs/datenschutz-baustein.md) (Entwurf, rechtlich zu prüfen).
- Anfragen aus dem Demomodus wurden nie gespeichert. Die Live-Datenbank startet leer.

## Abnahmetests (live)

`tests/abnahme/` enthält eine Nachbildung von apaleo und Resend (`mock-server.mjs`) und die API-Abnahme (`api-abnahme.mjs`). Damit lassen sich alle Fälle ohne echte Buchungen oder E-Mails gegen eine lokale Postgres prüfen:
- freie und belegte Termine,
- Wartung, Abendsperre und Block,
- mehrtägige Anfragen (letzter Tag belegt),
- apaleo-Ausfall (500, 204, ungültige Antwort, abgelehnter Zugang, Zeitüberschreitung, fehlender Tag),
- E-Mail-Ausfall mit Wiederholung,
- doppelte und parallele Einsendung,
- Spam-Schutz, Rate-Limit und interner Zugang.

Die Anleitung steht am Anfang von `api-abnahme.mjs`.

## Annahmen und offene Punkte

Die folgenden Punkte sind angenommen und zentral in `src/lib/booking.ts` anpassbar:

- Anfragen sind ab morgen möglich (`MIN_LEAD_DAYS = 1`), bis 24 Monate im Voraus.
- Uhrzeiten im 30-Minuten-Raster von 06:00 bis 24:00 Uhr. Bei mehreren Tagen gilt „von“ für den ersten und „bis“ für den letzten Tag.
- Es gibt bewusst keine Kapazitätsgrenze. Die Personenzahl wird nur auf Plausibilität geprüft (ganze Zahl ab 1).
