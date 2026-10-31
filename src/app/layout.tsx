import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anfrage · SPACE im HØV, Altusried",
  description:
    "Frag den Veranstaltungsraum SPACE im HØV in Altusried unverbindlich an: 63 m² mit großer Küche. Betrieben von UNIQUE PLACES.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F8F6F1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={GeistSans.variable}>
      <body>{children}</body>
    </html>
  );
}
