import { NextResponse } from "next/server";
import { getModeState, getPrivacyUrl } from "@/server/config";
import { isAdminAuthorization } from "@/server/admin-auth";
import { getRequest, REQUEST_STATUSES, updateRequest, type RequestStatus } from "@/server/requests";
import { sendRequestEmails } from "@/server/mail";

export const dynamic = "force-dynamic";

/** Aktionen der internen Übersicht: Status/Notiz speichern, E-Mails erneut senden. */
export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  if (!isAdminAuthorization(req.headers.get("authorization"))) return new NextResponse("Nicht erlaubt", { status: 401 });
  // Schutz vor fremden Formularen (CSRF): nur Anfragen von dieser Website
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return new NextResponse("Nicht erlaubt", { status: 403 });
  const state = getModeState();
  if (state.mode !== "live") return new NextResponse("Nicht verfügbar", { status: 404 });
  const { ref } = await params;
  const data = await getRequest(state.config, ref);
  if (!data) return new NextResponse("Nicht gefunden", { status: 404 });
  const form = await req.formData();
  const action = String(form.get("action") ?? "");
  const base = new URL(req.url).origin;
  if (action === "status") {
    const status = String(form.get("status") ?? "");
    if (!(REQUEST_STATUSES as readonly string[]).includes(status)) return new NextResponse("Ungültiger Status", { status: 400 });
    await updateRequest(state.config, ref, status as RequestStatus, String(form.get("note") ?? ""));
    return NextResponse.redirect(`${base}/intern/${ref}?ok=status`, 303);
  }
  if (action === "retry") {
    await sendRequestEmails(state.config, data.request.id, { adminUrl: `${base}/intern/${ref}`, privacyUrl: getPrivacyUrl() });
    return NextResponse.redirect(`${base}/intern/${ref}?ok=retry`, 303);
  }
  return new NextResponse("Unbekannte Aktion", { status: 400 });
}
