import "server-only";

export type DataSource = "demo" | "apaleo";

/**
 * Serverseitige Konfiguration. Liest ausschließlich Umgebungsvariablen ohne
 * NEXT_PUBLIC_-Präfix – Zugangsdaten gelangen so nie in den Browser.
 */
export function getDataSource(): DataSource {
  return process.env.BOOKING_DATA_SOURCE === "apaleo" ? "apaleo" : "demo";
}

export function getApaleoConfig() {
  const clientId = process.env.APALEO_CLIENT_ID;
  const clientSecret = process.env.APALEO_CLIENT_SECRET;
  const propertyId = process.env.APALEO_PROPERTY_ID;
  const unitGroupId = process.env.APALEO_UNIT_GROUP_ID;
  if (!clientId || !clientSecret || !propertyId || !unitGroupId) {
    throw new Error(
      "apaleo ist als Datenquelle gewählt, aber APALEO_CLIENT_ID, APALEO_CLIENT_SECRET, APALEO_PROPERTY_ID oder APALEO_UNIT_GROUP_ID fehlen.",
    );
  }
  return { clientId, clientSecret, propertyId, unitGroupId };
}
