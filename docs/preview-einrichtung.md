# Testumgebung (Vercel Preview) einrichten

Diese Anleitung stellt **nur die Preview-Deployments des Feature-Branches** `claude/space-hoev-booking-flow-e93kco` auf den Live-Modus um. Production (`main`, https://space-anfrage.vercel.app) bleibt unverändert im Demomodus.

Grundsätze:
- Jede Umgebung bekommt eine **eigene Datenbank** und eigene Zugangsdaten.
- apaleo wird **nur lesend** angebunden. Es entstehen keine Buchungen oder Sperren.
- Geheimnisse gehören nur in Vercel, nie ins Repository oder in den Chat.

---

## 1. Was sich gegenüber der bisherigen Version ändert

Bisherige Version: `main`, Commit `80fe9e1`, Demomodus.

| Variable | Bisher | Neu | Hinweis |
| --- | --- | --- | --- |
| `BOOKING_DATA_SOURCE` | `demo` (einzige Schaltervariable) | **abgelöst** durch `BOOKING_MODE` | Wird aus Kompatibilität noch gelesen, siehe Abschnitt 2 |
| `BOOKING_MODE` | – | **neu**: `demo` oder `live` | Hauptschalter |
| `APALEO_CLIENT_ID`, `APALEO_CLIENT_SECRET` | vorhanden, ungenutzt | **jetzt genutzt** | Client nur mit Scope `availability.read` |
| `APALEO_PROPERTY_ID` | vorhanden, ungenutzt | **jetzt genutzt**: `ALTUS` | |
| `APALEO_UNIT_GROUP_ID` | vorhanden, ungenutzt | **jetzt genutzt**: `ALTUS-SPACE` | |
| `REQUEST_NOTIFICATION_EMAIL` | vorhanden, ungenutzt | **entfällt** | Ersetzt durch `MAIL_INTERNAL_TO`; kann gelöscht werden |
| `DATABASE_URL` | – | **neu** | Postgres der jeweiligen Umgebung |
| `RESEND_API_KEY` | – | **neu** | |
| `MAIL_FROM` | – | **neu** | Absender auf verifizierter Domain |
| `MAIL_INTERNAL_TO` | – | **neu**: `stay@unique-places.com` | |
| `MAIL_REPLY_TO` | – | **neu** (empfohlen): `stay@unique-places.com` | |
| `REQUEST_HASH_SECRET` | – | **neu** | Zufallswert, mind. 32 Zeichen |
| `ADMIN_USER`, `ADMIN_PASSWORD` | – | **neu** | Zugang zu `/intern`, Passwort mind. 12 Zeichen |
| `CRON_SECRET` | – | **neu** (empfohlen) | mind. 16 Zeichen |
| `PRIVACY_URL` | – | **neu** (optional) | Standard `https://unique-places.com/datenschutz` |
| `EMBED_ALLOWED_ORIGINS` | vorhanden | unverändert | Für die Preview nicht nötig |
| `MAIL_TRANSPORT`, `APALEO_API_URL`, `APALEO_IDENTITY_URL`, `RESEND_API_URL` | – | nur für lokale Tests | **In Vercel nicht setzen** |

## 2. `BOOKING_MODE` und `BOOKING_DATA_SOURCE`

`BOOKING_MODE` ist der neue Schalter. `BOOKING_DATA_SOURCE` stammt aus der Demo-Version. Die neue Version liest ihn nur noch, **wenn `BOOKING_MODE` leer ist**:

| `BOOKING_MODE` | `BOOKING_DATA_SOURCE` | Ergebnis |
| --- | --- | --- |
| `demo` | beliebig | Demomodus |
| `live` | beliebig | Live-Modus. Fehlt eine Pflichtvariable oder ist sie ungültig: **gesperrt** (kein Demo) |
| leer | leer oder `demo` | Demomodus |
| leer | `apaleo` | Live-Modus (Kompatibilität) |
| leer | anderer Wert | gesperrt |
| anderer Wert | beliebig | gesperrt |

„Gesperrt“ bedeutet: Das Formular zeigt „Online-Anfragen sind gerade nicht möglich. Bitte schreib uns direkt an stay@unique-places.com.“ und nimmt nichts an. Fehlende Variablen erscheinen namentlich (ohne Werte) im Vercel-Log als `config.misconfigured`.

**Empfehlung:**
- **Preview (nur dieser Branch):** `BOOKING_MODE=live`.
- **Production:** jetzt schon ausdrücklich `BOOKING_MODE=demo` setzen. Die aktuelle Production-Version ignoriert diese Variable. Nach einer späteren Übernahme nach `main` bleibt Production damit trotzdem im Demomodus, bis ihr bewusst umschaltet.
- `BOOKING_DATA_SOURCE` erst löschen, wenn Production die neue Version nutzt.
- `BOOKING_MODE=live` **nie** für „All Environments“ setzen.

## 3. Datenbank anlegen (nur für Preview)

Eine **neue, leere** Postgres-Datenbank nur für diese Testumgebung anlegen. Die im Claude-Arbeitsbereich hinterlegte Supabase-Verbindung ist diesem Projekt nicht eindeutig zugeordnet und soll **nicht** verwendet werden.

**Variante A – Neon über Vercel (empfohlen):**
1. Vercel → Projekt `space-anfrage` → Storage → Create Database → Neon.
2. Region **Frankfurt (eu-central-1)** wählen.
3. Beim Verbinden mit dem Projekt nur die Umgebung **Preview** anhaken.
4. Vercel legt `DATABASE_URL` (und weitere `PG*`/`POSTGRES_*`-Variablen) für Preview an. Die App nutzt nur `DATABASE_URL`.

**Variante B – Supabase:**
1. Ein **neues** Projekt anlegen, z. B. `space-anfrage-preview`, Region **Frankfurt (eu-central-1)**.
2. Project Settings → Database → Connection string, Modus „Session pooler“ (Port 5432) oder „Transaction pooler“ (Port 6543). Beide sind mit der App verträglich.
3. Den String als `DATABASE_URL` für Preview eintragen (Schritt 6).

### Schema anlegen (Migration)

Das Schema steht versioniert in `src/server/schema.ts`. Migration 1 legt an:
- `anfragen`,
- `anfrage_emails`,
- `anfrage_rate_limits`,
- die Versionstabelle `space_schema_migrations`.

Auf allen Tabellen ist **Row Level Security aktiv**. Bei Supabase werden den Rollen `anon` und `authenticated` alle Rechte entzogen. Anfragen sind damit auch über die Supabase-Daten-API nicht abrufbar. Bestehende fremde Tabellen werden nicht verändert.

Zwei Wege, beide idempotent:

1. **Ausdrücklich (empfohlen)**, lokal im Repository:
   ```bash
   npm install
   DATABASE_URL='<Preview-Verbindung>' npm run db:migrate -- --ziel=<Hostname der Datenbank>
   ```
   `--ziel` muss dem Hostnamen in `DATABASE_URL` entsprechen. Das schützt vor einer versehentlich falschen Datenbank. Erwartete Ausgabe:
   ```
   Angewendet: 1 anfragen_emails_ratelimit
     anfrage_emails: vorhanden, Row Level Security aktiv
     anfrage_rate_limits: vorhanden, Row Level Security aktiv
     anfragen: vorhanden, Row Level Security aktiv
     space_schema_migrations: vorhanden, Row Level Security aktiv
   ```
2. **Automatisch:** Fehlt das Schema, legt die App es beim ersten Zugriff an (gleiche Migration, gegen Parallelität gesperrt).

## 4. apaleo-Zugang (nur lesend)

1. In apaleo eine **eigene** App mit Client-Credentials-Zugang (Client ID und Secret) für dieses Projekt anlegen.
2. Als Scope **ausschließlich `availability.read`** freigeben.
3. Für Preview und Production dürfen dieselben Zugangsdaten verwendet werden, weil der Zugang nur liest. Getrennte Zugangsdaten sind sauberer.

So prüft die App die Verfügbarkeit, abgeglichen mit der echten Konfiguration von `ALTUS`:

| apaleo | Wert |
| --- | --- |
| Kategorie | `ALTUS-SPACE` (MeetingRoom, 1 Einheit `ALTUS-SIQ`) |
| Zeitscheibe `ALTUS-DAY` | DayUse, 10:00–16:00 |
| Zeitscheibe `ALTUS-NIGHT` | OverNight, 16:00–10:00 (Folgetag) |
| Rate | `ALTUS-STD-SPACE` (nur DayUse) |

Ein Tag D gilt nur als frei, wenn **der ganze Kalendertag 00:00–24:00** frei ist:
- OverNight des Vortags (00–10 Uhr),
- DayUse (10–16 Uhr),
- OverNight des Tages (16–24 Uhr).

Damit sind alle wählbaren Zeiten (06:00–24:00) einschließlich Auf- und Abbau abgedeckt. Die Lückenlosigkeit wird bei jeder Abfrage anhand der Zeitstempel kontrolliert. Fehler oder unvollständige Antworten ergeben „nicht prüfbar“, nie „belegt“ und nie „frei“.

## 5. E-Mail-Versand (Resend)

1. In Resend eine Absenderdomain anlegen, z. B. eine Subdomain wie `mail.unique-places.com`, Region EU.
2. Die angezeigten DNS-Einträge (SPF/MX für Return-Path, DKIM) beim DNS-Anbieter von unique-places.com eintragen und auf „Verified“ warten. DMARC-Eintrag empfohlen.
3. Einen API-Key mit **„Sending access“ nur für diese Domain** erzeugen. Für Preview und Production getrennte Keys verwenden.

## 6. Variablen in Vercel eintragen

Vercel → Projekt → Settings → Environment Variables. Für jede Variable:
- **Environment:** nur **Preview** anhaken.
- **Git Branch:** `claude/space-hoev-booking-flow-e93kco`.

| Variable | Wert |
| --- | --- |
| `BOOKING_MODE` | `live` |
| `APALEO_CLIENT_ID` | aus Schritt 4 |
| `APALEO_CLIENT_SECRET` | aus Schritt 4 (als „Sensitive“ markieren) |
| `APALEO_PROPERTY_ID` | `ALTUS` |
| `APALEO_UNIT_GROUP_ID` | `ALTUS-SPACE` |
| `DATABASE_URL` | aus Schritt 3 (bei Neon automatisch vorhanden) |
| `RESEND_API_KEY` | aus Schritt 5 (Sensitive) |
| `MAIL_FROM` | z. B. `SPACE im HØV <anfrage@mail.unique-places.com>` |
| `MAIL_INTERNAL_TO` | Für den Test eine eigene Adresse, später `stay@unique-places.com` |
| `MAIL_REPLY_TO` | `stay@unique-places.com` |
| `REQUEST_HASH_SECRET` | `openssl rand -hex 32` (Sensitive) |
| `ADMIN_USER` | frei wählbar |
| `ADMIN_PASSWORD` | starkes Passwort, mind. 12 Zeichen (Sensitive) |
| `CRON_SECRET` | `openssl rand -hex 24` (Sensitive) |

Zusätzlich für **Production** jetzt nur `BOOKING_MODE=demo` setzen (siehe Abschnitt 2), sonst nichts.

## 7. Neu deployen

Variablen wirken erst nach einem neuen Deployment:
1. Vercel → Deployments → neuestes Deployment des Branches → „Redeploy“.
2. Die Preview-Adresse steht beim Deployment („Visit“).

Hinweise:
- Preview-Adressen sind bei Vercel meist per Vercel-Login geschützt (Deployment Protection). Für die Abnahme die Preview direkt im Browser öffnen, angemeldet bei Vercel, nicht über WordPress.
- Den täglichen Cron für die E-Mail-Wiederholung führt Vercel nur in Production aus. In der Preview fehlgeschlagene E-Mails über `/intern` → Anfrage → „Nicht versendete E-Mails erneut senden“ nachsenden.

## 8. Abnahme in der Preview

1. **Betriebsart:** Die Startseite zeigt keinen Demo-Hinweis. Steht dort „Online-Anfragen sind gerade nicht möglich“: Vercel → Logs → `config.misconfigured` nennt die fehlenden Variablen.
2. **Echte Belegung:** Im Kalender zum Oktober 2027 blättern. In apaleo ist eine Wartung vom 22.10.2027 16:00 bis 24.10.2027 10:00 eingetragen. Erwartet:
   - 22.10. belegt (Abend),
   - 23.10. belegt,
   - 24.10. belegt (Morgen bis 10 Uhr),
   - 21.10. und 25.10. frei.
3. **Testanfrage:** einen freien Tag mit eigener E-Mail-Adresse anfragen. Prüfen:
   - Bestätigung mit Referenz `SPACE-…`,
   - Eingangsbestätigung im Postfach (Kopfzeilen: SPF/DKIM „pass“),
   - interne Mail an `MAIL_INTERNAL_TO`.
4. **Doppelt senden:** auf „Unverbindlich anfragen“ doppelt klicken. In `/intern` darf nur eine Anfrage stehen.
5. **Übersicht:** `https://<Preview-Adresse>/intern`.
   - Ohne Zugangsdaten: abgewiesen.
   - Mit Zugangsdaten: Liste, Status ändern, Notiz speichern.
6. **apaleo nicht erreichbar (optional):** `APALEO_CLIENT_SECRET` in Preview vorübergehend auf einen falschen Wert setzen und neu deployen. Erwartet:
   - Kalender: „Die Belegung konnte gerade nicht geprüft werden“, Tage grau ohne „×“, nicht als belegt markiert,
   - Absenden: „Die Verfügbarkeit konnte gerade nicht geprüft werden“.

   Danach Wert zurücksetzen und neu deployen.
7. **Logs:** Vercel → Logs, Filter `[anfrage]`. Keine Namen, Nachrichten oder Telefonnummern, E-Mail-Adressen nur maskiert.

Testanfragen bleiben in der Preview-Datenbank und gelangen nicht nach Production.

## 9. Danach

Erst nach erfolgreicher Abnahme und ausdrücklicher Freigabe:
1. Übernahme nach `main`.
2. Production mit eigener Datenbank, eigenem Resend-Key und `BOOKING_MODE=live` umstellen.

Bis dahin bleibt Production im Demomodus.
