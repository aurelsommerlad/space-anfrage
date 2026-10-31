import "server-only";
import { addDays, addMonths, firstOfMonth, lastOfMonth, monthOf, todayInVenue } from "@/lib/dates";
import { MAX_MONTHS_AHEAD, MIN_LEAD_DAYS } from "@/lib/booking";
import { applyBooked, checkPrefill, readPrefillParams, type PrefillResult } from "@/lib/prefill";
import { getBookingBackend } from "./booking-backend";
import { getDataSource } from "./config";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Startdaten für die erste Darstellung (serverseitig gerendert).
 * Mit URL-Parametern (beginn/ende/personen) werden diese hier erneut geprüft
 * – inklusive Belegung –, bevor der Browser etwas anzeigt.
 */
export async function getInitialBookingData(searchParams: SearchParams = {}) {
  const today = todayInVenue();
  const earliest = addDays(today, MIN_LEAD_DAYS);
  const latest = lastOfMonth(addMonths(monthOf(today), MAX_MONTHS_AHEAD));
  const backend = getBookingBackend();

  let prefill: PrefillResult | null = null;
  const params = readPrefillParams(searchParams);
  if (params) {
    prefill = checkPrefill(params, { earliest, latest });
    if (prefill.startDate && prefill.endDate) {
      let booked: string[] | null = null;
      try {
        booked = await backend.getBookedDates(prefill.startDate, prefill.endDate);
      } catch (err) {
        console.error("[prefill]", err);
      }
      prefill = applyBooked(prefill, booked);
    }
  }

  const focus = prefill?.startDate ?? prefill?.requestedStart ?? earliest;
  const month = monthOf(focus);
  let bookedDates: string[] = [];
  let loadedMonths: string[] = [];
  try {
    bookedDates = await backend.getBookedDates(firstOfMonth(month), lastOfMonth(addMonths(month, 1)));
    loadedMonths = [month, addMonths(month, 1)];
  } catch (err) {
    console.error("[initial-data]", err);
  }
  return {
    today,
    earliestDate: earliest,
    initialMonth: month,
    bookedDates,
    loadedMonths,
    demo: getDataSource() === "demo",
    prefill,
  };
}

export type InitialBookingData = Awaited<ReturnType<typeof getInitialBookingData>>;
