import localFont from "next/font/local";

/**
 * Schriften der Website unique-places.com (Elementor-Kit), selbst gehostet.
 * Roboto: Fließtext, Beschriftungen, Buttons. Josefin Sans: Überschriften.
 * Dateien: @fontsource 5.3 (latin), SIL Open Font License 1.1 – siehe ./fonts/LICENSE-*.txt
 */
export const roboto = localFont({
  src: [
    { path: "./fonts/roboto-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "./fonts/roboto-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/roboto-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-roboto",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

export const josefinSans = localFont({
  src: [
    { path: "./fonts/josefin-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
  ],
  variable: "--font-josefin",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});
