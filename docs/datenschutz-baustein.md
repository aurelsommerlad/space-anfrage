# Datenschutz-Baustein: Anfrage für den SPACE im HØV

> **Entwurf zur Prüfung.** Dieser Text beschreibt die tatsächliche technische Umsetzung der Anfragestrecke (Stand Live-Betrieb). Er ersetzt keine rechtliche Prüfung. Er ist als zusätzlicher Abschnitt für die bestehende Datenschutzerklärung unter https://unique-places.com/datenschutz gedacht. Offene Punkte sind mit **[zu entscheiden]** markiert. Die Angaben zu den Anbietern (Firmensitz, Region, Vertrag zur Auftragsverarbeitung) bitte vor Veröffentlichung anhand der tatsächlich abgeschlossenen Verträge abgleichen.

---

## Anfrage für den Veranstaltungsraum SPACE im HØV

Über unser Anfrageformular kannst du den SPACE im HØV unverbindlich anfragen. Das Formular ist auf unserer Website eingebunden und wird technisch von einer eigenen Anwendung bereitgestellt (space-anfrage.vercel.app).

**Welche Daten wir verarbeiten**
- Deine Angaben im Formular:
  - Wunschtermin und Uhrzeit
  - Anlass
  - Personenzahl
  - Wünsche (freiwillig)
  - Übernachtungswunsch
  - Name
  - E-Mail-Adresse
  - Unternehmen (freiwillig)
  - Telefonnummer (freiwillig)
- Technische Daten beim Absenden:
  - Zeitpunkt
  - IP-Adresse (nur gekürzt bzw. pseudonymisiert, siehe unten)

**Zweck und Rechtsgrundlage**
- **Bearbeitung deiner Anfrage:** Wir verwenden deine Angaben, um deine Anfrage zu bearbeiten, dir ein Angebot zu machen und mit dir Kontakt aufzunehmen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (vorvertragliche Maßnahmen auf deine Anfrage).
- **Schutz vor Missbrauch:** Um das Formular vor Missbrauch und automatisierten Massenanfragen zu schützen, zählen wir Anfragen je IP-Adresse. Dabei speichern wir die IP-Adresse nicht im Klartext, sondern nur als nicht umkehrbaren, mit einem geheimen Schlüssel gebildeten Wert (Pseudonym). Diese Zähler löschen wir nach spätestens zwei Tagen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse ist der sichere Betrieb des Formulars.

**Verfügbarkeitsprüfung**
Damit wir dir nur freie Termine anbieten, fragt die Anwendung die Belegung des Raums in unserem Hotelverwaltungssystem **apaleo** (apaleo GmbH, München) ab. Dabei wird ausschließlich der gewünschte Zeitraum übermittelt, **keine personenbezogenen Daten**. Eine Reservierung entsteht durch die Anfrage nicht.

**Eingesetzte Dienstleister (Auftragsverarbeiter)**
- **Vercel Inc.** (USA): Hosting der Anwendung. Beim Aufruf verarbeitet Vercel technisch notwendige Verbindungsdaten (u. a. IP-Adresse) in Server-Protokollen. **[zu entscheiden: Region und Aufbewahrungsdauer der Protokolle laut Vercel-Vertrag]**
- **[Neon Inc. (USA), Datenbank-Region Frankfurt (EU)] [zu entscheiden: tatsächlich gewählter Postgres-Anbieter und Region]:** Speicherung deiner Anfrage in einer Datenbank.
- **Resend (Plus Five Five, Inc., USA) [zu entscheiden: Region]:** Versand der E-Mails zu deiner Anfrage, also unserer internen Benachrichtigung und deiner Eingangsbestätigung.

Mit allen Dienstleistern bestehen Verträge zur Auftragsverarbeitung nach Art. 28 DSGVO. Soweit Daten in die USA übermittelt werden, stützt sich die Übermittlung auf den Angemessenheitsbeschluss der EU-Kommission (EU-U.S. Data Privacy Framework), sofern der Anbieter zertifiziert ist, und ergänzend auf die EU-Standardvertragsklauseln. **[zu prüfen: Zertifizierung und Verträge der einzelnen Anbieter]**

**E-Mails**
Nach dem Absenden erhältst du eine Eingangsbestätigung mit einer Zusammenfassung deiner Angaben. Wir erhalten eine interne Benachrichtigung an stay@unique-places.com.

**Speicher im Browser**
Damit deine Eingaben beim Wechsel zwischen den Schritten nicht verloren gehen, speichert das Formular sie vorübergehend im Sitzungsspeicher deines Browsers (sessionStorage). Diese Daten verlassen deinen Browser erst beim Absenden. Sie werden nach dem Absenden bzw. beim Schließen des Tabs gelöscht. Cookies oder Analyse- und Tracking-Dienste setzt das Formular nicht ein. Schriften werden von der Anwendung selbst ausgeliefert, nicht von externen Anbietern.

**Speicherdauer**
**[zu entscheiden]** Vorschlag:
- Anfragen, aus denen keine Buchung entsteht: Löschung 12 Monate nach der letzten Kommunikation.
- Anfragen, die zu einer Buchung führen: Übernahme in die Buchungsunterlagen, dann gelten die gesetzlichen Aufbewahrungsfristen.

*(Hinweis für uns: Die Anwendung löscht Anfragen derzeit nicht automatisch. Eine Löschfrist sollte festgelegt und umgesetzt werden.)*

**Deine Rechte**
Es gelten die in dieser Datenschutzerklärung beschriebenen Rechte (Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch, Beschwerde bei einer Aufsichtsbehörde). Wende dich dafür an die oben genannte verantwortliche Stelle.
