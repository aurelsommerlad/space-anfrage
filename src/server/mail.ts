import "server-only";
import { occasionLabel, VENUE, type OccasionId } from "@/lib/booking";
import { formatDateLong, formatRange } from "@/lib/dates";
import { ensureSchema } from "./db";
import type { LiveConfig } from "./config";
import { log, maskEmail } from "./log";
import type { StoredEmail, StoredRequest } from "./requests";

/**
 * E-Mail-Versand über Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Jede Mail ist in anfrage_emails protokolliert (ausstehend/gesendet/fehlgeschlagen)
 * und kann erneut versendet werden. Der Idempotency-Key verhindert Doppelversand
 * beim Wiederholen.
 */

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function rows(r: StoredRequest): [string, string][] {
  const range = formatRange(r.start_date, r.end_date === r.start_date ? null : r.end_date);
  const multi = r.end_date !== r.start_date;
  return [
    ["Termin", multi ? `${range} (${formatDateLong(r.start_date)} bis ${formatDateLong(r.end_date)})` : formatDateLong(r.start_date)],
    ["Uhrzeit", `${r.start_time} bis ${r.end_time} Uhr${multi ? " (Beginn am ersten, Ende am letzten Tag)" : ""}`],
    ["Anlass", occasionLabel(r.occasion as OccasionId)],
    ["Personen", String(r.guests)],
    ["Übernachtung im HØV", r.overnight ? "Gewünscht" : "Nicht gewünscht"],
    ["Wünsche", r.message || "–"],
  ];
}

function layout(title: string, intro: string, table: [string, string][], outro: string): string {
  const tr = table
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 16px 8px 0;color:#666;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:8px 0;color:#1e1e1e;white-space:pre-line">${esc(v)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="de"><body style="margin:0;background:#ffffff;font-family:Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1e1e1e">
<div style="max-width:600px;margin:0 auto;padding:32px 24px">
<p style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#666;margin:0 0 12px">${esc(VENUE.name)}</p>
<h1 style="font-size:22px;font-weight:400;margin:0 0 16px">${esc(title)}</h1>
<p style="margin:0 0 20px">${intro}</p>
<table style="border-collapse:collapse;border-top:1px solid #e5e5e5;border-bottom:1px solid #e5e5e5;width:100%">${tr}</table>
<p style="margin:20px 0 0">${outro}</p>
</div></body></html>`;
}

function text(intro: string, table: [string, string][], outro: string): string {
  return `${intro}\n\n${table.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${outro}\n`;
}

export function buildEmail(kind: StoredEmail["kind"], r: StoredRequest, opts: { adminUrl: string | null; privacyUrl: string }) {
  const t = rows(r);
  if (kind === "intern") {
    const contact: [string, string][] = [
      ["Referenz", r.reference],
      ["Name", r.name],
      ["E-Mail", r.email],
      ["Unternehmen", r.company || "–"],
      ["Telefon", r.phone || "–"],
    ];
    const range = formatRange(r.start_date, r.end_date === r.start_date ? null : r.end_date);
    const subject = `Neue SPACE-Anfrage ${r.reference}: ${range} · ${r.guests} Pers.`;
    const link = opts.adminUrl ? `Zur Anfrage: ${opts.adminUrl}` : "";
    return {
      subject,
      html: layout("Neue Anfrage für den SPACE", "Über die Anfragestrecke ist eine neue, unverbindliche Anfrage eingegangen. Die Verfügbarkeit war beim Absenden laut apaleo gegeben; reserviert ist noch nichts.", [...contact, ...t], opts.adminUrl ? `<a href="${esc(opts.adminUrl)}" style="color:#1e1e1e">Anfrage in der Übersicht öffnen</a>` : ""),
      text: text("Neue unverbindliche Anfrage für den SPACE im HØV. Reserviert ist noch nichts.", [...contact, ...t], link),
      replyTo: r.email,
    };
  }
  const first = r.name.trim().split(/\s+/)[0] ?? "";
  const subject = `Deine Anfrage für den ${VENUE.name} (${r.reference})`;
  const intro = `Hallo ${esc(first)}, danke für deine Anfrage. Wir haben sie erhalten und melden uns bei dir.`;
  const note =
    "Bitte beachte: Deine Anfrage ist unverbindlich und noch keine Reservierung. Erst mit unserer Bestätigung ist der Termin für dich reserviert.";
  const privacy = `Informationen zum Datenschutz: ${opts.privacyUrl}`;
  return {
    subject,
    html: layout(
      "Deine Anfrage ist eingegangen",
      intro,
      [["Anfragenummer", r.reference], ...t],
      `<strong>${esc(note)}</strong><br><br>Bei Fragen antworte einfach auf diese E-Mail.<br><br><span style="color:#666;font-size:13px">UNIQUE PLACES · ${esc(VENUE.name)}, ${esc(VENUE.location)} · <a href="${esc(opts.privacyUrl)}" style="color:#666">Datenschutz</a></span>`,
    ),
    text: text(`Hallo ${first}, danke für deine Anfrage. Wir haben sie erhalten und melden uns bei dir.`, [["Anfragenummer", r.reference], ...t], `${note}\n\nBei Fragen antworte einfach auf diese E-Mail.\n\n${privacy}`),
    replyTo: null as string | null,
  };
}

async function deliver(cfg: LiveConfig, to: string[], mail: { subject: string; html: string; text: string; replyTo: string | null }, idempotencyKey: string): Promise<string> {
  if (cfg.mail.transport === "log") {
    log.info("mail.log_transport", { to: to.map(maskEmail), subject: mail.subject.replace(/:.*$/, "") });
    return `log-${idempotencyKey}`;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${cfg.mail.apiUrl}/emails`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${cfg.mail.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        from: cfg.mail.from,
        to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : cfg.mail.replyTo ? { reply_to: cfg.mail.replyTo } : {}),
      }),
    });
    const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
    if (!res.ok || !body?.id) throw new Error(`HTTP ${res.status}${body?.name ? ` ${body.name}` : ""}`);
    return body.id;
  } catch (e) {
    throw new Error((e as Error).name === "AbortError" ? "Zeitüberschreitung" : (e as Error).message);
  } finally {
    clearTimeout(t);
  }
}

/** Selbsttest: Test-E-Mail an MAIL_INTERNAL_TO. Liefert die Resend-ID oder wirft mit Fehlergrund (ohne Geheimnisse). */
export async function sendTestEmail(cfg: LiveConfig): Promise<string> {
  const when = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
  const intro = `Diese E-Mail wurde vom Selbsttest der SPACE-Anfragestrecke versendet (${when}). Absender, Domain-Authentifizierung und Zustellung an die interne Adresse funktionieren.`;
  return deliver(
    cfg,
    cfg.mail.internalTo,
    {
      subject: "[TEST] SPACE-Anfragestrecke: Selbsttest E-Mail-Versand",
      html: layout("Selbsttest E-Mail-Versand", esc(intro), [["Umgebung", cfg.environment]], "Keine Anfrage, keine Reservierung."),
      text: text(intro, [["Umgebung", cfg.environment]], "Keine Anfrage, keine Reservierung."),
      replyTo: null,
    },
    `selbsttest-${Date.now()}`,
  );
}

/** Versendet ausstehende bzw. fehlgeschlagene Mails einer Anfrage. Wirft nie. */
export async function sendRequestEmails(
  cfg: LiveConfig,
  anfrageId: number,
  opts: { adminUrl: string | null; privacyUrl: string; onlyFailed?: boolean },
): Promise<{ sent: number; failed: number }> {
  const sql = await ensureSchema(cfg.databaseUrl);
  const reqRows = await sql<StoredRequest[]>`
    select *, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date
    from anfragen where id = ${anfrageId}`;
  const r = reqRows[0];
  if (!r) return { sent: 0, failed: 0 };
  const emails = await sql<StoredEmail[]>`
    select * from anfrage_emails where anfrage_id = ${anfrageId}
    and status in ${opts.onlyFailed ? sql(["fehlgeschlagen"]) : sql(["ausstehend", "fehlgeschlagen"])}
    order by kind desc`;
  let sent = 0;
  let failed = 0;
  for (const e of emails) {
    // Sperre gegen paralleles Senden derselben Mail
    const claimed = await sql`update anfrage_emails set attempts = attempts + 1, updated_at = now()
      where id = ${e.id} and status <> 'gesendet' returning id`;
    if (!claimed[0]) continue;
    const mail = buildEmail(e.kind, r, opts);
    const to = e.kind === "intern" ? cfg.mail.internalTo : [r.email];
    try {
      const providerId = await deliver(cfg, to, mail, `${r.reference}-${e.kind}`);
      await sql`update anfrage_emails set status = 'gesendet', provider_id = ${providerId}, sent_at = now(), last_error = null, updated_at = now() where id = ${e.id}`;
      sent++;
    } catch (err) {
      const msg = String((err as Error).message).slice(0, 300);
      await sql`update anfrage_emails set status = 'fehlgeschlagen', last_error = ${msg}, updated_at = now() where id = ${e.id}`;
      log.error("mail.failed", { reference: r.reference, kind: e.kind, to: to.map(maskEmail), reason: msg });
      failed++;
    }
  }
  return { sent, failed };
}

/** Erneuter Versand aller fehlgeschlagenen Mails (z. B. per Cron), max. 8 Versuche je Mail. */
export async function retryFailedEmails(cfg: LiveConfig, opts: { adminUrlFor: (ref: string) => string | null; privacyUrl: string }) {
  const sql = await ensureSchema(cfg.databaseUrl);
  const rows = await sql<{ anfrage_id: number; reference: string }[]>`
    select distinct e.anfrage_id, a.reference from anfrage_emails e join anfragen a on a.id = e.anfrage_id
    where e.status in ('fehlgeschlagen', 'ausstehend') and e.attempts < 8 and e.updated_at < now() - interval '2 minutes'
    limit 50`;
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const r = await sendRequestEmails(cfg, row.anfrage_id, { adminUrl: opts.adminUrlFor(row.reference), privacyUrl: opts.privacyUrl });
    sent += r.sent;
    failed += r.failed;
  }
  return { sent, failed, requests: rows.length };
}
