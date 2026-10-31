import type { NextConfig } from "next";

const embedAncestors = process.env.EMBED_FRAME_ANCESTORS?.trim();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Standardseiten dürfen nicht fremd eingebettet werden.
        source: "/((?!embed).*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Einbettungsmodus: erlaubte Seiten über EMBED_FRAME_ANCESTORS steuern.
        source: "/embed",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors 'self'${embedAncestors ? ` ${embedAncestors}` : ""}`,
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
