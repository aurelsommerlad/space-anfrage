import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getAdminCredentials } from "./config";

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Prüft HTTP-Basic-Zugangsdaten gegen ADMIN_USER/ADMIN_PASSWORD. Ohne Konfiguration: immer gesperrt. */
export function isAdminAuthorization(header: string | null): boolean {
  const creds = getAdminCredentials();
  if (!creds || !header?.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  return same(decoded.slice(0, i), creds.user) && same(decoded.slice(i + 1), creds.password);
}
