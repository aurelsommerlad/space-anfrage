import "server-only";
import { createHash, createHmac, randomInt } from "node:crypto";
import type { BookingRequest } from "@/lib/booking";
import { ensureSchema } from "./db";
import type { LiveConfig } from "./config";

export const REQUEST_STATUSES = ["neu", "in_bearbeitung", "angeboten", "bestaetigt", "abgelehnt", "storniert"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const STATUS_LABEL: Record<RequestStatus, string> = {
  neu: "Neu",
  in_bearbeitung: "In Bearbeitung",
  angeboten: "Angebot versendet",
  bestaetigt: "Bestätigt",
  abgelehnt: "Abgelehnt",
  storniert: "Storniert",
};

export interface StoredRequest {
  id: number;
  reference: string;
  status: RequestStatus;
  environment: string;
  created_at: Date;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  occasion: string;
  guests: number;
  message: string;
  overnight: boolean;
  name: string;
  email: string;
  company: string;
  phone: string;
  internal_note: string;
}

export interface StoredEmail {
  id: number;
  anfrage_id: number;
  kind: "intern" | "bestaetigung";
  recipient: string;
  status: "ausstehend" | "gesendet" | "fehlgeschlagen";
  attempts: number;
  last_error: string | null;
  sent_at: Date | null;
}

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function newReference(now = new Date()): string {
  const y = String(now.getUTCFullYear()).slice(2);
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  let tail = "";
  for (let i = 0; i < 4; i++) tail += ALPHABET[randomInt(ALPHABET.length)];
  return `SPACE-${y}${m}-${tail}`;
}

/** Inhaltlicher Schlüssel: gleiche Person, gleicher Termin, gleicher Anlass. */
function dedupeKey(r: BookingRequest): string {
  return createHash("sha256")
    .update([r.email.toLowerCase(), r.startDate, r.endDate, r.occasion].join("|"))
    .digest("hex");
}

export type CreateResult = { reference: string; id: number; duplicate: boolean };

/**
 * Speichert eine Anfrage. Doppelte Einsendungen werden erkannt:
 *  - gleiche idempotencyKey (z. B. Doppelklick, erneutes Senden nach Netzfehler)
 *  - gleiche Person + gleicher Termin + gleicher Anlass innerhalb von 30 Minuten
 * In beiden Fällen wird die bestehende Referenz zurückgegeben, nichts neu angelegt.
 */
export async function createRequest(
  cfg: LiveConfig,
  r: BookingRequest,
  idempotencyKey: string,
  internalTo: string[],
): Promise<CreateResult> {
  const sql = await ensureSchema(cfg.databaseUrl);
  const dk = dedupeKey(r);
  return sql.begin(async (tx) => {
    // Gleichzeitige Einsendungen derselben Anfrage serialisieren
    await tx`select pg_advisory_xact_lock(hashtext(${dk}))`;
    const byKey = await tx<{ id: number; reference: string }[]>`
      select id, reference from anfragen where idempotency_key = ${idempotencyKey} limit 1`;
    if (byKey[0]) return { ...byKey[0], duplicate: true };
    const byContent = await tx<{ id: number; reference: string }[]>`
      select id, reference from anfragen
      where dedupe_key = ${dk} and created_at > now() - interval '30 minutes'
      order by created_at desc limit 1`;
    if (byContent[0]) return { ...byContent[0], duplicate: true };

    for (let attempt = 0; attempt < 5; attempt++) {
      const reference = newReference();
      const rows = await tx<{ id: number }[]>`
        insert into anfragen (
          reference, environment, idempotency_key, dedupe_key,
          start_date, end_date, start_time, end_time, occasion, guests, message, overnight,
          name, email, company, phone, availability_checked_at
        ) values (
          ${reference}, ${cfg.environment}, ${idempotencyKey}, ${dk},
          ${r.startDate}, ${r.endDate}, ${r.startTime}, ${r.endTime}, ${r.occasion}, ${r.guests}, ${r.message}, ${r.overnight},
          ${r.name}, ${r.email}, ${r.company}, ${r.phone}, now()
        )
        on conflict (reference) do nothing
        returning id`;
      if (rows[0]) {
        const id = rows[0].id;
        await tx`insert into anfrage_emails (anfrage_id, kind, recipient) values (${id}, 'intern', ${internalTo.join(", ")})`;
        await tx`insert into anfrage_emails (anfrage_id, kind, recipient) values (${id}, 'bestaetigung', ${r.email})`;
        return { reference, id, duplicate: false };
      }
    }
    throw new Error("Referenznummer konnte nicht vergeben werden");
  });
}

export async function listRequests(cfg: LiveConfig, limit = 200) {
  const sql = await ensureSchema(cfg.databaseUrl);
  return sql<(StoredRequest & { mail_failed: number; mail_pending: number })[]>`
    select a.*, to_char(a.start_date, 'YYYY-MM-DD') as start_date, to_char(a.end_date, 'YYYY-MM-DD') as end_date,
      (select count(*)::int from anfrage_emails e where e.anfrage_id = a.id and e.status = 'fehlgeschlagen') as mail_failed,
      (select count(*)::int from anfrage_emails e where e.anfrage_id = a.id and e.status = 'ausstehend') as mail_pending
    from anfragen a order by a.created_at desc limit ${limit}`;
}

export async function getRequest(cfg: LiveConfig, reference: string) {
  const sql = await ensureSchema(cfg.databaseUrl);
  const rows = await sql<StoredRequest[]>`
    select *, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date
    from anfragen where reference = ${reference} limit 1`;
  if (!rows[0]) return null;
  const emails = await sql<StoredEmail[]>`select * from anfrage_emails where anfrage_id = ${rows[0].id} order by kind`;
  return { request: rows[0], emails };
}

export async function updateRequest(cfg: LiveConfig, reference: string, status: RequestStatus, note: string) {
  const sql = await ensureSchema(cfg.databaseUrl);
  await sql`update anfragen set status = ${status}, internal_note = ${note.slice(0, 4000)}, updated_at = now() where reference = ${reference}`;
}

/* ---------------- Rate-Limit (fester Zeitraum, je pseudonymisierter IP) ---------------- */

export function pseudonymize(cfg: LiveConfig, ip: string): string {
  return createHmac("sha256", cfg.hashSecret).update(ip).digest("hex").slice(0, 32);
}

/** true = erlaubt. Zählt den Aufruf. */
export async function hitRateLimit(cfg: LiveConfig, bucket: string, windowSeconds: number, max: number): Promise<boolean> {
  const sql = await ensureSchema(cfg.databaseUrl);
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const rows = await sql<{ hits: number }[]>`
    insert into anfrage_rate_limits (bucket, window_start, hits) values (${bucket}, ${windowStart}, 1)
    on conflict (bucket, window_start) do update set hits = anfrage_rate_limits.hits + 1
    returning hits`;
  // Gelegentlich alte Einträge entfernen
  if (Math.random() < 0.02) await sql`delete from anfrage_rate_limits where window_start < now() - interval '2 days'`;
  return (rows[0]?.hits ?? 1) <= max;
}
