import "server-only";
import { addDays, addMonths, firstOfMonth, lastOfMonth, monthOf, todayInVenue } from "@/lib/dates";
import { MAX_MONTHS_AHEAD, MIN_LEAD_DAYS } from "@/lib/booking";
import { applyBooked, checkPrefill, readPrefillParams, type PrefillResult } from "@/lib/prefill";
import { getBookedDates } from "./booking-backend";
import { getModeState, getPrivacyUrl } from "./config";
import { log } from "./log";

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
  const state = getModeState();
  if (state.mode === "misconfigured") log.error("config.misconfigured", { problems: state.problems });

  let prefill: PrefillResult | null = null;
  const params = readPrefillParams(searchParams);
  if (params) {
    prefill = checkPrefill(params, { earliest, latest });
    if (prefill.startDate && prefill.endDate) {
      let booked: string[] | null = null;
      try {
        booked = await getBookedDates(prefill.startDate, prefill.endDate, { state });
      } catch (err) {
        log.error("prefill.availability_failed", { reason: (err as Error).message });
      }
      prefill = applyBooked(prefill, booked);
    }
  }

  const focus = prefill?.startDate ?? prefill?.requestedStart ?? earliest;
  const month = monthOf(focus);
  let bookedDates: string[] = [];
  let loadedMonths: string[] = [];
  try {
    bookedDates = await getBookedDates(firstOfMonth(month), lastOfMonth(addMonths(month, 1)), { state });
    loadedMonths = [month, addMonths(month, 1)];
  } catch (err) {
    log.error("initial.availability_failed", { reason: (err as Error).message });
  }
  return {
    today,
    earliestDate: earliest,
    initialMonth: month,
    bookedDates,
    loadedMonths,
    demo: state.mode === "demo",
    /** Live gewählt, aber unvollständig konfiguriert: Anfragen gesperrt. */
    unavailable: state.mode === "misconfigured",
    privacyUrl: getPrivacyUrl(),
    prefill,
  };
}

export type InitialBookingData = Awaited<ReturnType<typeof getInitialBookingData>>;
