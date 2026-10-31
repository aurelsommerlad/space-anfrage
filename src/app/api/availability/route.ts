import { NextResponse, type NextRequest } from "next/server";
import { addMonths, daysInclusive, firstOfMonth, isIsoMonth, lastOfMonth } from "@/lib/dates";
import type { AvailabilityResponse } from "@/lib/availability";
import { availabilitySource, ConfigurationError, getBookedDates } from "@/server/booking-backend";
import { getModeState } from "@/server/config";
import { clientIp, memoryRateLimit } from "@/server/request-meta";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";

/**
 * GET /api/availability?from=2026-11&to=2026-12
 * Liefert belegte Tage für die angefragten Monate (höchstens 6).
 * Fehler werden als Fehler gemeldet (503) – nie als "frei".
 */
export async function GET(req: NextRequest) {
  const fromMonth = req.nextUrl.searchParams.get("from");
  const toMonth = req.nextUrl.searchParams.get("to") ?? fromMonth;
  if (!isIsoMonth(fromMonth) || !isIsoMonth(toMonth) || toMonth < fromMonth) {
    return NextResponse.json({ error: "Ungültiger Zeitraum." }, { status: 400 });
  }
  if (toMonth > addMonths(fromMonth, 5)) {
    return NextResponse.json({ error: "Zeitraum zu lang." }, { status: 400 });
  }
  const from = firstOfMonth(fromMonth);
  const to = lastOfMonth(toMonth);
  if (daysInclusive(from, to) > 190) {
    return NextResponse.json({ error: "Zeitraum zu lang." }, { status: 400 });
  }
  if (!memoryRateLimit(`avail:${clientIp(req)}`, 60_000, 90)) {
    return NextResponse.json({ error: "Zu viele Anfragen. Bitte versuche es gleich noch einmal." }, { status: 429 });
  }

  const state = getModeState();
  try {
    const body: AvailabilityResponse = {
      from,
      to,
      bookedDates: await getBookedDates(from, to, { state }),
      source: availabilitySource(state),
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (!(err instanceof ConfigurationError)) log.error("availability.failed", { from, to, reason: (err as Error).message });
    return NextResponse.json({ error: "Verfügbarkeit konnte nicht geladen werden." }, { status: 503 });
  }
}
