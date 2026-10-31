import "server-only";
import { addDays, addMonths, firstOfMonth, lastOfMonth, monthOf, todayInVenue } from "@/lib/dates";
import { MIN_LEAD_DAYS } from "@/lib/booking";
import { getBookingBackend } from "./booking-backend";
import { getDataSource } from "./config";

/** Startdaten für die erste Darstellung (serverseitig gerendert). */
export async function getInitialBookingData() {
  const today = todayInVenue();
  const earliest = addDays(today, MIN_LEAD_DAYS);
  const month = monthOf(earliest);
  const backend = getBookingBackend();
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
  };
}

export type InitialBookingData = Awaited<ReturnType<typeof getInitialBookingData>>;
