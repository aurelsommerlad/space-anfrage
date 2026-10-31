import "server-only";
import { parseAllowedOrigins } from "@/lib/origins";

/**
 * Serverseitige Konfiguration. Liest ausschließlich Umgebungsvariablen ohne
 * NEXT_PUBLIC_-Präfix – Zugangsdaten gelangen so nie in den Browser.
 *
 * Betriebsart (BOOKING_MODE):
 *   demo – Beispieldaten, keine Speicherung, kein E-Mail-Versand (deutlich gekennzeichnet)
 *   live – apaleo-Verfügbarkeit, Speicherung in Postgres, E-Mail-Versand
 *
 * Grundsatz: Ist "live" gewählt, aber unvollständig konfiguriert, ist die Anfrage
 * gesperrt (Fehlermeldung) – es gibt KEINEN stillen Rückfall auf Demo.
 */
export type BookingMode = "demo" | "live";

export interface LiveConfig {
  apaleo: {
    clientId: string;
    clientSecret: string;
    propertyId: string;
    unitGroupId: string;
    apiUrl: string;
    identityUrl: string;
  };
  databaseUrl: string;
  mail: {
    transport: "resend" | "log";
    apiKey: string;
    apiUrl: string;
    from: string;
    internalTo: string[];
    replyTo: string | null;
  };
  /** Geheimer Schlüssel für das Pseudonymisieren von IP-Adressen (Rate-Limit). */
  hashSecret: string;
  environment: string;
}

export type ModeState =
  | { mode: "demo" }
  | { mode: "live"; config: LiveConfig }
  | { mode: "misconfigured"; problems: string[] };

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function deploymentEnvironment(): string {
  return env("VERCEL_ENV") || (process.env.NODE_ENV === "production" ? "production" : "development");
}

/** Ermittelt die Betriebsart. Nennt bei Fehlern nur Variablennamen, nie Werte. */
export function getModeState(): ModeState {
  const raw = env("BOOKING_MODE") || (env("BOOKING_DATA_SOURCE") === "apaleo" ? "live" : env("BOOKING_DATA_SOURCE"));
  if (raw === "" || raw === "demo") return { mode: "demo" };
  if (raw !== "live") return { mode: "misconfigured", problems: [`BOOKING_MODE hat einen ungültigen Wert (erlaubt: demo, live)`] };

  const problems: string[] = [];
  const need = (name: string) => {
    const v = env(name);
    if (!v) problems.push(`${name} fehlt`);
    return v;
  };
  const apaleo = {
    clientId: need("APALEO_CLIENT_ID"),
    clientSecret: need("APALEO_CLIENT_SECRET"),
    propertyId: need("APALEO_PROPERTY_ID"),
    unitGroupId: need("APALEO_UNIT_GROUP_ID"),
    apiUrl: env("APALEO_API_URL") || "https://api.apaleo.com",
    identityUrl: env("APALEO_IDENTITY_URL") || "https://identity.apaleo.com",
  };
  const databaseUrl = need("DATABASE_URL");
  const transport = env("MAIL_TRANSPORT") || "resend";
  const environment = deploymentEnvironment();
  if (transport !== "resend" && transport !== "log") problems.push("MAIL_TRANSPORT hat einen ungültigen Wert (erlaubt: resend, log)");
  if (transport === "log" && environment === "production") problems.push("MAIL_TRANSPORT=log ist in der Produktion nicht erlaubt");
  const mail = {
    transport: (transport === "log" ? "log" : "resend") as "resend" | "log",
    apiKey: transport === "resend" ? need("RESEND_API_KEY") : "",
    apiUrl: env("RESEND_API_URL") || "https://api.resend.com",
    from: need("MAIL_FROM"),
    internalTo: (env("MAIL_INTERNAL_TO") || "")
      .split(/[,\s]+/)
      .filter(Boolean),
    replyTo: env("MAIL_REPLY_TO") || null,
  };
  if (mail.internalTo.length === 0) problems.push("MAIL_INTERNAL_TO fehlt");
  const hashSecret = need("REQUEST_HASH_SECRET");
  if (hashSecret && hashSecret.length < 32) problems.push("REQUEST_HASH_SECRET ist zu kurz (mind. 32 Zeichen)");
  for (const u of [apaleo.apiUrl, apaleo.identityUrl, mail.apiUrl]) {
    if (!/^https:\/\//.test(u) && !(environment !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)/.test(u))) {
      problems.push("Eine Dienst-URL ist ungültig (nur https)");
    }
  }
  if (problems.length) return { mode: "misconfigured", problems };
  return { mode: "live", config: { apaleo, databaseUrl, mail, hashSecret, environment } };
}

/** Kompatibilität: Datenquelle für die Oberfläche. */
export function getDataSource(): "demo" | "apaleo" {
  return getModeState().mode === "demo" ? "demo" : "apaleo";
}

/** Websites, die /embed einbinden und mit dem iframe kommunizieren dürfen. */
export function getEmbedAllowedOrigins(): string[] {
  return parseAllowedOrigins(process.env.EMBED_ALLOWED_ORIGINS);
}

/** Link zur Datenschutzerklärung der Website. */
export function getPrivacyUrl(): string {
  const v = env("PRIVACY_URL");
  return /^https:\/\//.test(v) ? v : "https://unique-places.com/datenschutz";
}

/** Zugang zur internen Übersicht (/intern). */
export function getAdminCredentials(): { user: string; password: string } | null {
  const user = env("ADMIN_USER");
  const password = env("ADMIN_PASSWORD");
  if (!user || password.length < 12) return null;
  return { user, password };
}
