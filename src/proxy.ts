import { NextResponse, type NextRequest } from "next/server";

/**
 * Schützt die interne Übersicht (/intern) und ihre Aktionen per HTTP Basic Auth.
 * Die Seiten und Aktionen prüfen die Zugangsdaten zusätzlich selbst.
 */
function constantEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function proxy(request: NextRequest) {
  const user = (process.env.ADMIN_USER ?? "").trim();
  const password = (process.env.ADMIN_PASSWORD ?? "").trim();
  const header = request.headers.get("authorization") ?? "";
  let ok = false;
  if (user && password.length >= 12 && header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(":");
      ok = i > 0 && constantEqual(decoded.slice(0, i), user) && constantEqual(decoded.slice(i + 1), password);
    } catch {
      ok = false;
    }
  }
  if (!ok) {
    return new NextResponse("Zugang nur für UNIQUE PLACES.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="SPACE-Anfragen", charset="UTF-8"', "Cache-Control": "no-store" },
    });
  }
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/intern", "/intern/:path*", "/api/intern/:path*"],
};
