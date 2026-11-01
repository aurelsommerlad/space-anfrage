# Live-Betrieb einrichten (Production)

Diese Anleitung stellt https://space-anfrage.vercel.app auf den Live-Modus um.

Grundsätze:
- Geheimnisse werden nur in Vercel eingetragen, nie in den Chat, das Repository oder ein Ticket.
- apaleo wird **nur lesend** angebunden. Es entstehen keine Buchungen oder Sperren.
- SPACE bekommt eine **eigene** Datenbank. Die im Claude-Arbeitsbereich hinterlegte Supabase-Verbindung wird **nicht** verwendet.

Ablauf:
- **Teil A:** einrichten, während Production noch im Demomodus läuft.
- **Teil B:** im Selbsttest prüfen.
- **Teil C:** umschalten.

---

## Teil A – Einrichten (Production bleibt Demo)

### A1. Produktionsdatenbank (Neon über Vercel)

1. Vercel → Projekt **space-anfrage** → Reiter **Storage** → **Create Database** → **Neon** (Serverless Postgres).
2. Einstellungen:
   - **Region:** Frankfurt (eu-central-1)
   - **Name:** `space-anfrage-production`
   - Kostenloser Plan genügt für den Anfang.
3. **Connect Project:** nur die Umgebung **Production** anhaken. Den Präfix leer bzw. Standard lassen, damit die Variable `DATABASE_URL` heißt.
4. Danach steht `DATABASE_URL` unter Settings → Environment Variables (Production). Weitere `PG*`/`POSTGRES_*`-Variablen von Neon schaden nicht, die App nutzt nur `DATABASE_URL`.

Das Schema legst du später im Selbsttest an (Teil B). Die Datenbank darf noch leer sein.

### A2. apaleo-Zugang (nur lesend)

1. In apaleo (Account von HØV by UNIQUE PLACES) eine **eigene App mit Client-Credentials-Zugang** anlegen. In apaleo heißt das „Simple client“ bzw. „Custom app“ unter **Apps / Connected apps**.
2. Name z. B. `SPACE-ANFRAGE`.
3. Rechte (eine der beiden Varianten):
   - **Feingranularer Client (empfohlen):** Berechtigung **`core.unit_groups_availability.read`**, Property-Zugriff **nur ALTUS**.
   - **Scope-Client:** Scope **ausschließlich `availability.read`**.
4. Client ID und Client Secret werden einmalig angezeigt. **Direkt** in Vercel eintragen (A5), nicht zwischenspeichern.

Der Selbsttest prüft die Wirkung:
- Verfügbarkeit für ALTUS muss lesbar sein.
- Eine Gegenprobe auf die anderen Properties des Kontos (ALPILA, HUESLE, LAEKE, TEST) muss abgelehnt werden.

### A3. E-Mail-Absender (Resend)

1. Bei https://resend.com ein Konto für UNIQUE PLACES anlegen bzw. das vorhandene nutzen.
2. **Domains → Add Domain:**
   - Domain: `mail.unique-places.com` (eigene Subdomain, beeinflusst den bestehenden Mailverkehr von unique-places.com nicht)
   - Region: **eu-west-1 (Ireland)**
3. Resend zeigt DNS-Einträge an. Diese beim DNS-Anbieter von unique-places.com eintragen:

   | Typ | Name | Inhalt |
   | --- | --- | --- |
   | TXT | `resend._domainkey.mail` | DKIM-Schlüssel (`p=…`) |
   | MX | `send.mail` | `feedback-smtp.eu-west-1.amazonses.com`, Priorität 10 |
   | TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` |

   Die genauen Werte stehen in Resend; die Tabelle ist nur zur Orientierung. Empfohlen zusätzlich, falls für unique-places.com noch nicht vorhanden: TXT `_dmarc` mit `v=DMARC1; p=none; rua=mailto:stay@unique-places.com`.
4. In Resend **Verify DNS Records** wählen und warten, bis die Domain **Verified** ist (meist Minuten, selten bis 24 h).
5. **API Keys → Create API Key:**
   - Permission: **Sending access**
   - Domain: `mail.unique-places.com`

   Den Key direkt in Vercel eintragen (A5).

### A4. Eigene Zufallswerte erzeugen

Lokal im Terminal (Mac/Linux) oder im Passwortmanager erzeugen. Nicht in den Chat kopieren:

```bash
openssl rand -hex 32   # REQUEST_HASH_SECRET
openssl rand -hex 24   # CRON_SECRET
openssl rand -base64 18   # ADMIN_PASSWORD (oder Passwortmanager, mind. 12 Zeichen)
```

`ADMIN_USER` und `ADMIN_PASSWORD` im Passwortmanager des Teams ablegen. Damit öffnet ihr `/intern`.

### A5. Variablen in Vercel (nur Production)

Vercel → Projekt → **Settings → Environment Variables**. Für jede Variable:
- **Environment:** nur **Production**.
- Geheimnisse als **Sensitive** markieren (danach nicht mehr lesbar, nur ersetzbar).

| Variable | Wert | Sensitive |
| --- | --- | --- |
| `BOOKING_MODE` | `demo` (wird erst in Teil C auf `live` gestellt) | nein |
| `APALEO_CLIENT_ID` | aus A2 | ja |
| `APALEO_CLIENT_SECRET` | aus A2 | ja |
| `APALEO_PROPERTY_ID` | `ALTUS` | nein |
| `APALEO_UNIT_GROUP_ID` | `ALTUS-SPACE` | nein |
| `DATABASE_URL` | aus A1 (automatisch angelegt) | ja |
| `RESEND_API_KEY` | aus A3 | ja |
| `MAIL_FROM` | `SPACE im HØV <anfrage@mail.unique-places.com>` | nein |
| `MAIL_INTERNAL_TO` | `stay@unique-places.com` | nein |
| `MAIL_REPLY_TO` | `stay@unique-places.com` | nein |
| `REQUEST_HASH_SECRET` | aus A4 | ja |
| `ADMIN_USER` | frei wählbar, z. B. `unique-places` | nein |
| `ADMIN_PASSWORD` | aus A4 | ja |
| `CRON_SECRET` | aus A4 | ja |
| `EMBED_ALLOWED_ORIGINS` | `https://unique-places.com https://www.unique-places.com` (falls noch nicht gesetzt) | nein |
| `PRIVACY_URL` | optional, Standard `https://unique-places.com/datenschutz` | nein |

**Aufräumen:**
- `REQUEST_NOTIFICATION_EMAIL` löschen (ungenutzt).
- `BOOKING_DATA_SOURCE` kann bleiben. Es wird ignoriert, sobald `BOOKING_MODE` gesetzt ist, und kann nach der Umstellung gelöscht werden.

**Nicht setzen:** `MAIL_TRANSPORT`, `APALEO_API_URL`, `APALEO_IDENTITY_URL`, `RESEND_API_URL` (nur für lokale Tests).

**`BOOKING_MODE` gegenüber `BOOKING_DATA_SOURCE`:** `BOOKING_MODE` ist der Schalter und hat Vorrang. `BOOKING_DATA_SOURCE` stammt aus der Demo-Version und wird nur gelesen, wenn `BOOKING_MODE` leer ist (`apaleo` = live, `demo` oder leer = Demo). Ist `live` gewählt, aber etwas fehlt, ist das Formular **gesperrt**. Es zeigt dann „Online-Anfragen sind gerade nicht möglich. Bitte schreib uns direkt an stay@unique-places.com.“ und fällt nicht auf Demo zurück.

### A6. Neu deployen

Vercel → **Deployments** → oberstes Production-Deployment → **⋯ → Redeploy**. Variablen wirken erst nach einem neuen Deployment.

## Teil B – Selbsttest (vor der Umstellung)

1. https://space-anfrage.vercel.app/intern/selbsttest öffnen und mit `ADMIN_USER` / `ADMIN_PASSWORD` anmelden.
2. **Schema jetzt anlegen** wählen.
   - Legt die SPACE-Tabellen mit Row Level Security an.
   - Enthält die Datenbank fremde Tabellen, wird aus Sicherheitsgründen nichts angelegt.
3. **Test-E-Mail an MAIL_INTERNAL_TO senden** wählen und den Eingang bei stay@unique-places.com prüfen. Betreff: „[TEST] SPACE-Anfragestrecke: Selbsttest E-Mail-Versand“.
4. Oben muss stehen: **„Alle Prüfungen bestanden. Bereit für BOOKING_MODE=live.“**

Geprüft werden:
- **Datenbank:** Verbindung, Schema-Version, Row Level Security, Anbieter und Host maskiert (Warnung bei Supabase).
- **apaleo:** Token, Rechte (nur `availability.read`), lückenlose Verfügbarkeit der nächsten 90 Tage mit Liste der nicht freien Tage.
- **Resend:** DKIM, SPF/Return-Path, DMARC, API-Key (nur Senden).
- **Konfiguration:** Pflichtvariablen, Cron, Einbindung.

Die Seite zeigt keine Geheimnisse an. Die Tabelle kann also für die Abstimmung kopiert werden.

## Teil C – Umschalten

1. In Vercel `BOOKING_MODE` (Production) auf `live` ändern.
2. **Redeploy** (wie A6).
3. Selbsttest erneut öffnen: „Alle Prüfungen bestanden. Live-Betrieb aktiv.“
4. Startseite und https://unique-places.com/space-anfrage zeigen keinen Demo-Hinweis mehr.

**Zurück auf Demo** (falls nötig): `BOOKING_MODE=demo` und Redeploy. Gespeicherte Anfragen bleiben in der Datenbank.

## Betrieb

- **Status ohne Anmeldung:** https://space-anfrage.vercel.app/api/status zeigt dieselben Prüfungen wie der Selbsttest. Er gibt keine Geheimnisse und keine personenbezogenen Daten aus, die Datenbank nur als Anbieter mit Fingerabdruck.

- **Anfragen:** https://space-anfrage.vercel.app/intern (Status, Notizen, E-Mails erneut senden).
- **Fehlgeschlagene E-Mails:** Ein Vercel-Cron versucht sie täglich um 06:17 UTC erneut.
- **Logs:** Vercel → Logs, Filter `[anfrage]`. Keine Klartext-Personendaten.
- **Probleme:** Interessenten sehen bei jedem Fehler die Adresse stay@unique-places.com.
