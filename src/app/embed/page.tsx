import type { Metadata } from "next";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { getEmbedAllowedOrigins } from "@/server/config";
import { getInitialBookingData } from "@/server/initial-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Anfrage · SPACE im HØV",
};

/**
 * Einbettungsmodus ohne Header, Footer und Markenbereich.
 * Einbindung und Höhenanpassung: siehe docs/einbindung-elementor.md
 */
export default async function EmbedPage() {
  const initial = await getInitialBookingData();
  return <BookingFlow initial={initial} embed embedOrigins={getEmbedAllowedOrigins()} />;
}
