import "server-only";
import type { IsoDate } from "@/lib/dates";
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

/** Belegte Tage im Zeitraum from..to (inklusive). Wirft bei Fehlern – nie "frei" im Zweifel. */
export async function getBookedDates(from: IsoDate, to: IsoDate, opts: { fresh?: boolean; state?: ModeState } = {}): Promise<IsoDate[]> {
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
