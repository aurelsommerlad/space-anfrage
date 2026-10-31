import type { Metadata } from "next";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { getInitialBookingData } from "@/server/initial-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Anfrage · SPACE im HØV",
};

/**
 * Einbettungsmodus ohne Header und Footer, z. B. per
 * <iframe src="https://…/embed" title="Anfrage SPACE im HØV"></iframe>.
 * Die Höhe wird per postMessage an die einbettende Seite gemeldet.
 */
export default async function EmbedPage() {
  const initial = await getInitialBookingData();
  return <BookingFlow initial={initial} embed />;
}
