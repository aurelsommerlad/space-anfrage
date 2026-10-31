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
 * Einbindung, Vorbelegung (beginn/ende/personen) und Höhenanpassung: siehe docs/elementor-formular.html
 */
export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initial = await getInitialBookingData(await searchParams);
  return <BookingFlow initial={initial} embed embedOrigins={getEmbedAllowedOrigins()} />;
}
