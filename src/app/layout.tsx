import type { Metadata, Viewport } from "next";
import { josefinSans, roboto } from "./fonts";
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
  themeColor: "#FFFFFF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${roboto.variable} ${josefinSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
