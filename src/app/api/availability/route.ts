import { NextResponse, type NextRequest } from "next/server";
import { addMonths, daysInclusive, firstOfMonth, isIsoMonth, lastOfMonth } from "@/lib/dates";
import type { AvailabilityResponse } from "@/lib/availability";
import { getBookingBackend } from "@/server/booking-backend";

export const dynamic = "force-dynamic";

/**
 * GET /api/availability?from=2026-11&to=2026-12
 * Liefert belegte Tage für die angefragten Monate (höchstens 6).
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

  try {
    const backend = getBookingBackend();
    const body: AvailabilityResponse = {
      from,
      to,
      bookedDates: await backend.getBookedDates(from, to),
      source: backend.source,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[availability]", err);
    return NextResponse.json({ error: "Verfügbarkeit konnte nicht geladen werden." }, { status: 503 });
  }
}
