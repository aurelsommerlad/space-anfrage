/**
 * Gemeinsame Typen für Verfügbarkeiten (Client und Server).
 * Die Oberfläche kennt nur diese Typen – nicht die Datenquelle dahinter.
 */
import type { IsoDate } from "./dates";

export type DayStatus = "available" | "booked";

export interface AvailabilityResponse {
  from: IsoDate;
  to: IsoDate;
  /** Nur Tage mit Status ungleich "available" werden gelistet. */
  bookedDates: IsoDate[];
  /** "demo" = Beispieldaten, "apaleo" = Live-Daten. */
  source: "demo" | "apaleo";
}

export interface SubmitResponse {
  ok: true;
  reference: string;
  demo: boolean;
  receivedAt: string;
}

export interface SubmitErrorResponse {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string>;
  conflictDates?: IsoDate[];
}
