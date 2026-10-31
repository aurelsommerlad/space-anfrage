import { BookingFlow } from "@/components/booking/BookingFlow";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getInitialBookingData } from "@/server/initial-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await getInitialBookingData();
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
