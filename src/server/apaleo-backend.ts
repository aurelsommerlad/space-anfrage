import "server-only";
import type { BookingBackend } from "./booking-backend";
import { getApaleoConfig } from "./config";

/**
 * Platzhalter für die spätere apaleo-Anbindung.
 *
 * Vorgesehener Ablauf (serverseitig, Client-Credentials-Flow):
 *  1. Token über https://identity.apaleo.com/connect/token mit
 *     APALEO_CLIENT_ID / APALEO_CLIENT_SECRET holen (nur auf dem Server).
 *  2. getBookedDates: Verfügbarkeit der Unit-Group APALEO_UNIT_GROUP_ID im
 *     Property APALEO_PROPERTY_ID für den Zeitraum abfragen
 *     (z. B. /availability/v1/unit-groups) und Tage ohne freie Einheit als
 *     belegt zurückgeben.
 *  3. submitRequest: Anfrage weiterleiten (z. B. E-Mail an das Team oder
 *     optionaler Block). Eine verbindliche Reservierung entsteht erst nach
 *     Bestätigung durch UNIQUE PLACES.
 *
 * Datumswerte: Kalendertage beziehen sich auf Europe/Berlin; für Zeitstempel
 * venueDateTimeToIso() aus src/lib/dates.ts verwenden.
 */
export const apaleoBackend: BookingBackend = {
  source: "apaleo",
  async getBookedDates() {
    getApaleoConfig();
    throw new Error("apaleo-Anbindung ist noch nicht implementiert.");
  },
  async submitRequest() {
    getApaleoConfig();
    throw new Error("apaleo-Anbindung ist noch nicht implementiert.");
  },
};
