import "server-only";
import { addDays, compareDates, todayInVenue, type IsoDate } from "@/lib/dates";
import { MIN_LEAD_DAYS } from "@/lib/booking";
import { getModeState, type ModeState } from "./config";
import { demoBackend } from "./demo-backend";
import { getApaleoBlockedDates, getApaleoBlockedDatesCached } from "./apaleo-backend";

/**
 * Schnittstelle zwischen API-Routen und Datenquelle.
 * Die Oberfläche spricht ausschließlich mit /api/* – nie direkt mit apaleo.
 */
export class ConfigurationError extends Error {
  constructor() {
    super("Die Live-Konfiguration ist unvollständig.");
    this.name = "ConfigurationError";
  }
}

/**
 * Belegte Tage im Zeitraum from..to (inklusive). Wirft bei Fehlern – nie "frei" im Zweifel.
 *
 * Geprüft werden nur anfragbare Tage (ab heute + MIN_LEAD_DAYS, Berliner Zeit).
 * Heutige und vergangene Tage sind nicht wählbar und werden nicht abgefragt:
 * apaleo kürzt laufende bzw. lässt vergangene Zeitscheiben weg – das darf die
 * Prüfung zukünftiger Tage nicht verhindern.
 */
export async function getBookedDates(rawFrom: IsoDate, to: IsoDate, opts: { fresh?: boolean; state?: ModeState } = {}): Promise<IsoDate[]> {
  const earliest = addDays(todayInVenue(), MIN_LEAD_DAYS);
  const from = compareDates(rawFrom, earliest) < 0 ? earliest : rawFrom;
  if (compareDates(from, to) > 0) return [];
  const state = opts.state ?? getModeState();
  if (state.mode === "demo") return demoBackend.getBookedDates(from, to);
  if (state.mode === "misconfigured") throw new ConfigurationError();
  return opts.fresh
    ? getApaleoBlockedDates(state.config.apaleo, from, to)
    : getApaleoBlockedDatesCached(state.config.apaleo, from, to);
}

export function availabilitySource(state: ModeState = getModeState()): "demo" | "apaleo" {
  return state.mode === "demo" ? "demo" : "apaleo";
}
