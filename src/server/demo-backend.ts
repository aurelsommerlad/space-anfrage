import "server-only";
import { eachDay, type IsoDate } from "@/lib/dates";

/**
 * BEISPIELDATEN – keine echte Belegung.
 *
 * Belegte Tage werden deterministisch aus dem Datum berechnet, damit der
 * Kalender bei jedem Aufruf gleich aussieht und sich Mehrtagesauswahl,
 * Konflikte und Monatswechsel realistisch testen lassen.
 */
const FIXED_DEMO_BOOKINGS: [IsoDate, IsoDate][] = [
  // Ein zusammenhängender, mehrtägiger Beispielblock
  ["2026-11-12", "2026-11-14"],
  ["2026-12-18", "2026-12-20"],
];

function hash(str: string): number {
  // FNV-1a, 32 Bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function isDemoBooked(date: IsoDate): boolean {
  if (FIXED_DEMO_BOOKINGS.some(([a, b]) => date >= a && date <= b)) return true;
  return hash(`space-demo:${date}`) % 100 < 16;
}

export const demoBackend = {
  source: "demo",
  async getBookedDates(from: IsoDate, to: IsoDate): Promise<IsoDate[]> {
    return eachDay(from, to).filter(isDemoBooked);
  },
  async submitRequest() {
    // Demomodus: es wird nichts gespeichert, versendet oder reserviert.
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    return { reference: `DEMO-${rand}` };
  },
};
