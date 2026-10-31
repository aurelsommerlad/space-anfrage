import type { NextConfig } from "next";
import { parseAllowedOrigins } from "./src/lib/origins";

// Gelesen beim Build. Nach Änderung auf Vercel neu deployen.
const embedOrigins = parseAllowedOrigins(process.env.EMBED_ALLOWED_ORIGINS);

const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Normale Seiten dürfen nicht fremd eingebettet werden.
        source: "/((?!embed).*)",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }, ...common],
      },
      {
        // Einbettungsmodus: nur die ausdrücklich erlaubten Websites.
        source: "/embed",
        headers: [
          { key: "Content-Security-Policy", value: ["frame-ancestors 'self'", ...embedOrigins].join(" ") },
          ...common,
        ],
      },
    ];
  },
};

export default nextConfig;
