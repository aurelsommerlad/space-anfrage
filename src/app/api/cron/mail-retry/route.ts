import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getModeState, getPrivacyUrl } from "@/server/config";
import { retryFailedEmails } from "@/server/mail";

export const dynamic = "force-dynamic";

/** Wiederholt fehlgeschlagene E-Mails. Aufruf durch Vercel Cron mit "Authorization: Bearer CRON_SECRET". */
export async function GET(req: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (secret.length < 16 || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return new NextResponse("Nicht erlaubt", { status: 401 });
  }
  const state = getModeState();
  if (state.mode !== "live") return NextResponse.json({ skipped: state.mode });
  const base = new URL(req.url).origin;
  const result = await retryFailedEmails(state.config, { adminUrlFor: (ref) => `${base}/intern/${ref}`, privacyUrl: getPrivacyUrl() });
  return NextResponse.json(result);
}
