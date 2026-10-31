import { NextResponse } from "next/server";
import { z } from "zod";
import { bookingRequestSchema, MIN_LEAD_DAYS } from "@/lib/booking";
import { addDays, compareDates, timeToMinutes, todayInVenue } from "@/lib/dates";
import type { SubmitErrorResponse, SubmitResponse } from "@/lib/availability";
import { ConfigurationError, getBookedDates } from "@/server/booking-backend";
import { getModeState, getPrivacyUrl } from "@/server/config";
import { ApaleoUnavailableError } from "@/server/apaleo-backend";
import { createRequest, hitRateLimit, pseudonymize } from "@/server/requests";
import { sendRequestEmails } from "@/server/mail";
import { clientIp, memoryRateLimit } from "@/server/request-meta";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";

const submitSchema = bookingRequestSchema.extend({
  /** Vom Browser je Anfrage einmal erzeugt – verhindert doppeltes Speichern. */
  idempotencyKey: z.string().uuid(),
  /** Zeitpunkt, an dem das Formular geöffnet wurde (ms) – Schutz vor Bots. */
  startedAt: z.number().int().nonnegative(),
});

const MIN_FILL_MS = 4000;

function fail(status: number, body: Omit<SubmitErrorResponse, "ok">) {
  return NextResponse.json<SubmitErrorResponse>({ ok: false, ...body }, { status });
}

/**
 * POST /api/anfrage
 * Live: Validierung → Spam-Schutz → Rate-Limit → frische apaleo-Prüfung →
 * Speicherung → E-Mails. Erfolg wird erst nach erfolgreicher Speicherung gemeldet.
 * Demo: nichts wird gespeichert oder versendet.
 */
export async function POST(req: Request) {
  const state = getModeState();
  if (state.mode === "misconfigured") {
    log.error("config.misconfigured", { problems: state.problems });
    return fail(503, { error: "Anfragen sind gerade nicht möglich." });
  }

  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > 20_000) return fail(413, { error: "Die Anfrage ist zu groß." });
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail(400, { error: "Die Anfrage konnte nicht gelesen werden." });
  }

  const parsed = submitSchema.safeParse(json);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return fail(422, { error: "Bitte prüfe deine Angaben.", fieldErrors });
  }
  const { idempotencyKey, startedAt, website, ...data } = parsed.data;

  // Honeypot ausgefüllt: still "annehmen", aber nichts speichern oder versenden.
  if (website) {
    log.warn("spam.honeypot", {});
    return NextResponse.json<SubmitResponse>({ ok: true, reference: "—", demo: state.mode === "demo", receivedAt: new Date().toISOString() });
  }
  // Zu schnell ausgefüllt (typisch für Bots)
  if (Date.now() - startedAt < MIN_FILL_MS) {
    log.warn("spam.too_fast", {});
    return fail(429, { error: "Bitte prüfe deine Angaben und sende die Anfrage erneut." });
  }

  const ip = clientIp(req);
  if (state.mode === "live") {
    const who = pseudonymize(state.config, ip);
    try {
      const okShort = await hitRateLimit(state.config, `submit10m:${who}`, 600, 5);
      const okDay = await hitRateLimit(state.config, `submitDay:${who}`, 86_400, 20);
      if (!okShort || !okDay) {
        log.warn("ratelimit.submit", { who: who.slice(0, 8) });
        return fail(429, { error: "Zu viele Anfragen in kurzer Zeit. Bitte versuche es später erneut." });
      }
    } catch (e) {
      log.error("ratelimit.db_failed", { reason: (e as Error).message });
      return fail(503, { error: "Deine Anfrage konnte gerade nicht gespeichert werden. Bitte versuche es später erneut." });
    }
  } else if (!memoryRateLimit(`submit:${ip}`, 600_000, 10)) {
    return fail(429, { error: "Zu viele Anfragen in kurzer Zeit. Bitte versuche es später erneut." });
  }

  const earliest = addDays(todayInVenue(), MIN_LEAD_DAYS);
  if (compareDates(data.startDate, earliest) < 0) {
    return fail(422, { error: "Der gewünschte Termin liegt zu kurzfristig oder in der Vergangenheit.", fieldErrors: { startDate: "Bitte wähle einen späteren Tag." } });
  }
  if (compareDates(data.endDate, data.startDate) < 0) {
    return fail(422, { error: "Das Enddatum liegt vor dem Startdatum." });
  }
  if (data.startDate === data.endDate && timeToMinutes(data.endTime) <= timeToMinutes(data.startTime)) {
    return fail(422, { error: "Die Endzeit muss nach der Startzeit liegen.", fieldErrors: { endTime: "Die Endzeit muss nach der Startzeit liegen." } });
  }

  // Verfügbarkeit erneut und ohne Zwischenspeicher prüfen (alle Tage inkl. letztem Tag)
  let booked: string[];
  try {
    booked = await getBookedDates(data.startDate, data.endDate, { fresh: true, state });
  } catch (err) {
    if (err instanceof ApaleoUnavailableError || err instanceof ConfigurationError) {
      return fail(503, { error: "Die Verfügbarkeit konnte gerade nicht geprüft werden. Bitte versuche es in einigen Minuten erneut." });
    }
    log.error("submit.availability_unexpected", { reason: (err as Error).message });
    return fail(503, { error: "Die Verfügbarkeit konnte gerade nicht geprüft werden. Bitte versuche es in einigen Minuten erneut." });
  }
  if (booked.length > 0) {
    return fail(409, {
      error: "Im gewählten Zeitraum ist der Raum inzwischen belegt. Bitte wähle einen anderen Termin.",
      conflictDates: booked,
    });
  }

  if (state.mode === "demo") {
    // Demomodus: es wird nichts gespeichert, versendet oder reserviert.
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    return NextResponse.json<SubmitResponse>({ ok: true, reference: `DEMO-${rand}`, demo: true, receivedAt: new Date().toISOString() });
  }

  // Speichern – erst danach Erfolg melden
  const cfg = state.config;
  let created;
  try {
    created = await createRequest(cfg, data, idempotencyKey, cfg.mail.internalTo);
  } catch (err) {
    log.error("submit.store_failed", { reason: (err as Error).message });
    return fail(503, { error: "Deine Anfrage konnte gerade nicht gespeichert werden. Bitte versuche es später erneut." });
  }
  log.info(created.duplicate ? "submit.duplicate" : "submit.stored", { reference: created.reference });

  if (!created.duplicate) {
    const origin = new URL(req.url).origin;
    const result = await sendRequestEmails(cfg, created.id, { adminUrl: `${origin}/intern/${created.reference}`, privacyUrl: getPrivacyUrl() }).catch((e) => {
      log.error("mail.unexpected", { reference: created.reference, reason: (e as Error).message });
      return { sent: 0, failed: 2 };
    });
    if (result.failed) log.warn("submit.mail_pending_retry", { reference: created.reference, failed: result.failed });
  }

  return NextResponse.json<SubmitResponse>({ ok: true, reference: created.reference, demo: false, receivedAt: new Date().toISOString() });
}
