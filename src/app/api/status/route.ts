import { NextResponse } from "next/server";
import { runSelftest } from "@/server/selftest";
import { clientIp, memoryRateLimit } from "@/server/request-meta";

export const dynamic = "force-dynamic";

/**
 * GET /api/status – Betriebsstatus ohne Geheimnisse und ohne personenbezogene Daten.
 * Dieselben Prüfungen wie /intern/selbsttest, aber nur Status, Variablennamen,
 * Anbieter und nicht umkehrbare Fingerabdrücke. Ergebnis 60 s zwischengespeichert.
 */
let cached: { at: number; body: unknown } | null = null;

export async function GET(req: Request) {
  if (!memoryRateLimit(`status:${clientIp(req)}`, 60_000, 20)) {
    return NextResponse.json({ error: "Zu viele Abfragen." }, { status: 429 });
  }
  if (!cached || Date.now() - cached.at > 60_000) {
    const { checks, ready, mode } = await runSelftest({ public: true });
    cached = {
      at: Date.now(),
      body: {
        mode,
        ready,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
        commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || null,
        checkedAt: new Date().toISOString(),
        checks,
      },
    };
  }
  return NextResponse.json(cached.body, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
