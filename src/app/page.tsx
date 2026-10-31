import { BookingFlow } from "@/components/booking/BookingFlow";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getInitialBookingData } from "@/server/initial-data";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initial = await getInitialBookingData(await searchParams);
  return (
    <>
      <a className="skip-link" href="#anfrage">
        Zum Anfrageformular springen
      </a>
      <SiteHeader />
      <BookingFlow initial={initial} embed={false} />
      <SiteFooter />
    </>
  );
}
