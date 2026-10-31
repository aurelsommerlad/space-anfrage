import { NextResponse } from "next/server";
import { isAdminAuthorization } from "@/server/admin-auth";
import { readLiveConfig } from "@/server/config";
import { getSql, migrate } from "@/server/db";
import { sendTestEmail } from "@/server/mail";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";

/** Aktionen des Selbsttests: Schema anlegen, Test-E-Mail senden. */
export async function POST(req: Request) {
  if (!isAdminAuthorization(req.headers.get("authorization"))) return new NextResponse("Nicht erlaubt", { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return new NextResponse("Nicht erlaubt", { status: 403 });
  const base = `${new URL(req.url).origin}/intern/selbsttest`;
  const live = readLiveConfig();
  if (!live.config) return NextResponse.redirect(`${base}?schema=fail&grund=${encodeURIComponent("Konfiguration unvollständig")}`, 303);
  const action = String((await req.formData()).get("action") ?? "");
  if (action === "schema") {
    try {
      const applied = await migrate(getSql(live.config.databaseUrl));
      log.info("selftest.schema", { applied });
      return NextResponse.redirect(`${base}?schema=ok`, 303);
    } catch (e) {
      const msg = (e as Error).message.startsWith("Die Datenbank enthält fremde Tabellen") ? (e as Error).message : "Datenbankfehler";
      log.error("selftest.schema_failed", { reason: msg });
      return NextResponse.redirect(`${base}?schema=fail&grund=${encodeURIComponent(msg)}`, 303);
    }
  }
  if (action === "testmail") {
    try {
      await sendTestEmail(live.config);
      log.info("selftest.testmail_sent", {});
      return NextResponse.redirect(`${base}?mail=ok`, 303);
    } catch (e) {
      const msg = String((e as Error).message).slice(0, 120);
      log.error("selftest.testmail_failed", { reason: msg });
      return NextResponse.redirect(`${base}?mail=fail&grund=${encodeURIComponent(msg)}`, 303);
    }
  }
  return new NextResponse("Unbekannte Aktion", { status: 400 });
}
