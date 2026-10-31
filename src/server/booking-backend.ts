import "server-only";
import type { IsoDate } from "@/lib/dates";
import type { BookingRequest } from "@/lib/booking";
import { getDataSource } from "./config";
import { demoBackend } from "./demo-backend";
import { apaleoBackend } from "./apaleo-backend";

/**
 * Schnittstelle zwischen API-Routen und Datenquelle.
 * Die Oberfläche spricht ausschließlich mit /api/* – nie direkt mit apaleo.
 */
export interface BookingBackend {
  readonly source: "demo" | "apaleo";
  /** Belegte Tage im Zeitraum from..to (jeweils inklusive). */
  getBookedDates(from: IsoDate, to: IsoDate): Promise<IsoDate[]>;
  /** Nimmt eine Anfrage entgegen. Reserviert nichts – erst die Bestätigung durch das Team. */
  submitRequest(request: BookingRequest): Promise<{ reference: string }>;
}

export function getBookingBackend(): BookingBackend {
  return getDataSource() === "apaleo" ? apaleoBackend : demoBackend;
}
