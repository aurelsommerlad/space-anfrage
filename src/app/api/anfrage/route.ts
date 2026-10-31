import { NextResponse } from "next/server";
import { bookingRequestSchema, MIN_LEAD_DAYS } from "@/lib/booking";
import { addDays, compareDates, timeToMinutes, todayInVenue } from "@/lib/dates";
import type { SubmitErrorResponse, SubmitResponse } from "@/lib/availability";
import { getBookingBackend } from "@/server/booking-backend";

export const dynamic = "force-dynamic";

function fail(status: number, body: Omit<SubmitErrorResponse, "ok">) {
  return NextResponse.json<SubmitErrorResponse>({ ok: false, ...body }, { status });
}

/**
 * POST /api/anfrage
 * Prüft die Anfrage serverseitig erneut (Schema, Datum, Verfügbarkeit)
 * und reicht sie an das Backend weiter. Im Demomodus wird nichts versendet.
 */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail(400, { error: "Die Anfrage konnte nicht gelesen werden." });
  }

  const parsed = bookingRequestSchema.safeParse(json);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return fail(422, { error: "Bitte prüfe deine Angaben.", fieldErrors });
  }
  const data = parsed.data;

  // Honeypot ausgefüllt: still akzeptieren, aber nichts weiterreichen.
  if (data.website) {
    return NextResponse.json<SubmitResponse>({
      ok: true,
      reference: "—",
      demo: true,
      receivedAt: new Date().toISOString(),
    });
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

  try {
    const backend = getBookingBackend();
    const booked = await backend.getBookedDates(data.startDate, data.endDate);
    if (booked.length > 0) {
      return fail(409, {
        error: "Im gewählten Zeitraum ist der Raum inzwischen belegt. Bitte wähle einen anderen Termin.",
        conflictDates: booked,
      });
    }
    const { reference } = await backend.submitRequest(data);
    return NextResponse.json<SubmitResponse>({
      ok: true,
      reference,
      demo: backend.source === "demo",
      receivedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[anfrage]", err);
    return fail(503, { error: "Deine Anfrage konnte gerade nicht übermittelt werden. Bitte versuche es später erneut." });
  }
}
