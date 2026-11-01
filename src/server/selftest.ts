import "server-only";
import { createHash } from "node:crypto";
import { resolveMx, resolveTxt } from "node:dns/promises";
import { addDays, todayInVenue } from "@/lib/dates";
import { getEmbedAllowedOrigins, getModeState, getPrivacyUrl, mailFromAddress, rawBookingMode, readLiveConfig, type LiveConfig } from "./config";
import { checkApaleoAccess, getApaleoBlockedDates, probeOtherProperty } from "./apaleo-backend";
import { getSql, migrate } from "./db";
import { FOREIGN_TABLES_SQL, HAS_MIGRATIONS_TABLE_SQL, MIGRATIONS } from "./schema";

/**
 * Selbsttest der Live-Konfiguration. Läuft auch im Demomodus, damit vor der
 * Umstellung geprüft werden kann. Gibt NIE Werte von Geheimnissen aus – nur
 * Status, Variablennamen, maskierte Hostnamen und öffentliche Angaben.
 */
export type CheckStatus = "ok" | "warn" | "fail" | "info";
export interface Check {
  group: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

function maskHost(host: string): string {
  const [first = "", ...rest] = host.split(".");
  const masked = first.length > 6 ? `${first.slice(0, 3)}…${first.slice(-2)}` : first;
  return [masked, ...rest].join(".");
}

/** Nicht umkehrbarer Fingerabdruck von Host und Benutzer – zum Abgleich, welche Datenbank verbunden ist. */
export function dbFingerprint(databaseUrl: string): string {
  try {
    const u = new URL(databaseUrl);
    return createHash("sha256").update(`${u.hostname}|${decodeURIComponent(u.username)}`).digest("hex").slice(0, 10);
  } catch {
    return "–";
  }
}

function dbRegion(host: string): string {
  return /(eu|us|ap|sa|ca|me|af)-[a-z]+-\d/.exec(host)?.[0] ?? "";
}

function dbProvider(host: string): string {
  if (/\.neon\.tech$/.test(host)) return "Neon";
  if (/supabase\.(com|co)$/.test(host)) return "Supabase";
  if (/^(localhost|127\.0\.0\.1)$/.test(host)) return "lokal";
  return "anderer Anbieter";
}

/** Datenbankfehler ohne Zugangsdaten beschreiben. */
function dbError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  switch (err.code) {
    case "ENOTFOUND":
      return "Host nicht gefunden";
    case "ECONNREFUSED":
      return "Verbindung abgelehnt";
    case "CONNECT_TIMEOUT":
    case "ETIMEDOUT":
      return "Zeitüberschreitung beim Verbinden";
    case "28P01":
    case "28000":
      return "Anmeldung abgelehnt (Benutzer oder Passwort falsch)";
    case "3D000":
      return "Datenbank existiert nicht";
    default:
      if (err.message?.startsWith("Die Datenbank enthält fremde Tabellen")) return err.message;
      return `Verbindung fehlgeschlagen${err.code ? ` (${err.code})` : ""}`;
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<never>((_, rej) => (t = setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), ms)))]);
  } finally {
    clearTimeout(t);
  }
}

async function checkDatabase(cfg: LiveConfig, applySchema: boolean, pub: boolean): Promise<Check[]> {
  const out: Check[] = [];
  const g = "Datenbank";
  let host = "";
  try {
    host = new URL(cfg.databaseUrl).hostname;
  } catch {
    return [{ group: g, label: "Verbindung", status: "fail", detail: "DATABASE_URL ist nicht lesbar" }];
  }
  const provider = dbProvider(host);
  out.push({
    group: g,
    label: "Ziel",
    status: provider === "Supabase" ? "warn" : "info",
    detail: `${provider}${dbRegion(host) ? ` (${dbRegion(host)})` : ""}${/^db\.[a-z0-9]+\.supabase\.co$/.test(host) ? ", Direktverbindung" : /pooler\.supabase\.com$/.test(host) ? ", Pooler" : ""}, ${pub ? "" : `Host ${maskHost(host)}, `}Fingerabdruck ${dbFingerprint(cfg.databaseUrl)}${provider === "Supabase" ? " – bitte sicherstellen, dass dies das eigene SPACE-Projekt ist" : ""}`,
  });
  const sql = getSql(cfg.databaseUrl);
  try {
    const [v] = await withTimeout(sql<{ v: string }[]>`select current_setting('server_version') as v`, 10_000);
    out.push({ group: g, label: "Verbindung", status: "ok", detail: `Postgres ${v?.v ?? "?"}` });
  } catch (e) {
    const code = (e as { code?: string }).code;
    const supabaseDirect = /^db\.[a-z0-9]+\.supabase\.co$/.test(host);
    out.push({
      group: g,
      label: "Verbindung",
      status: "fail",
      detail:
        supabaseDirect && (code === "ENOTFOUND" || code === "ETIMEDOUT" || code === "EAI_AGAIN")
          ? "Host nicht erreichbar: Supabase-Direktverbindung (db.….supabase.co) ist nur per IPv6 erreichbar, Vercel unterstützt kein IPv6 – DATABASE_URL durch die Pooler-Verbindung ersetzen (Supabase → Connect → Transaction pooler, Port 6543)"
          : dbError(e),
    });
    return out;
  }
  try {
    if (applySchema) {
      const applied = await migrate(sql);
      out.push({ group: g, label: "Schema anlegen", status: "ok", detail: applied.length ? `Angewendet: Migration ${applied.join(", ")}` : "Bereits aktuell" });
    }
    const present = (await sql.unsafe<{ present: boolean }[]>(HAS_MIGRATIONS_TABLE_SQL))[0]?.present ?? false;
    const foreign = await sql.unsafe<{ name: string }[]>(FOREIGN_TABLES_SQL);
    if (!present) {
      out.push(
        foreign.length
          ? { group: g, label: "Schema", status: "fail", detail: `Kein SPACE-Schema, aber ${foreign.length} fremde Tabelle(n) – vermutlich nicht die SPACE-Datenbank. Es wird nichts angelegt.` }
          : { group: g, label: "Schema", status: "fail", detail: "Noch nicht angelegt (leere Datenbank) – „Schema jetzt anlegen“ wählen" },
      );
      return out;
    }
    const done = (await sql<{ id: number }[]>`select id from space_schema_migrations order by id`).map((r) => r.id);
    const missing = MIGRATIONS.filter((m) => !done.includes(m.id)).map((m) => m.id);
    out.push({
      group: g,
      label: "Schema",
      status: missing.length ? "fail" : "ok",
      detail: missing.length ? `Migration ${missing.join(", ")} fehlt – „Schema jetzt anlegen“ wählen` : `Version ${done.at(-1)} (aktuell)`,
    });
    const rls = await sql<{ relname: string; on: boolean }[]>`
      select c.relname, c.relrowsecurity as on from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = current_schema() and c.relname in ('anfragen','anfrage_emails','anfrage_rate_limits','space_schema_migrations')`;
    const off = rls.filter((r) => !r.on).map((r) => r.relname);
    out.push({ group: g, label: "Row Level Security", status: off.length || rls.length < 4 ? "fail" : "ok", detail: off.length ? `aus bei: ${off.join(", ")}` : "auf allen 4 Tabellen aktiv" });
    if (foreign.length) out.push({ group: g, label: "Weitere Tabellen", status: "warn", detail: `${foreign.length} Tabelle(n), die nicht zu SPACE gehören – eigene Datenbank empfohlen` });
    if (!pub) {
      const [c] = await sql<{ n: number }[]>`select count(*)::int as n from anfragen`;
      out.push({ group: g, label: "Gespeicherte Anfragen", status: "info", detail: String(c?.n ?? 0) });
    }
    const mails = await sql<{ status: string; n: number }[]>`
      select status, count(*)::int as n from anfrage_emails where updated_at > now() - interval '7 days' group by status`;
    const m = Object.fromEntries(mails.map((r) => [r.status, r.n])) as Record<string, number>;
    out.push({
      group: "E-Mail (Resend)",
      label: "Versand der letzten 7 Tage",
      status: (m.fehlgeschlagen ?? 0) > 0 ? "warn" : "info",
      detail: `gesendet ${m.gesendet ?? 0}, fehlgeschlagen ${m.fehlgeschlagen ?? 0}, ausstehend ${m.ausstehend ?? 0}`,
    });
  } catch (e) {
    out.push({ group: g, label: "Schema", status: "fail", detail: dbError(e) });
  }
  return out;
}

async function checkApaleo(cfg: LiveConfig): Promise<Check[]> {
  const g = "apaleo";
  const out: Check[] = [];
  try {
    const { scopes } = await checkApaleoAccess(cfg.apaleo);
    if (scopes?.includes("identity:permissions")) {
      // Feingranularer Client: Berechtigungen stehen nicht im Token; geprüft über die Abfragen unten.
      out.push({
        group: g,
        label: "Zugang und Rechte",
        status: "ok",
        detail: "Token erhalten – feingranularer Client (benötigt: core.unit_groups_availability.read und Freigabe für " + cfg.apaleo.propertyId + "; Wirkung unten geprüft)",
      });
    } else if (!scopes) {
      out.push({ group: g, label: "Zugang", status: "ok", detail: "Token erhalten (Rechte nicht lesbar; Wirkung unten geprüft)" });
    } else {
      const relevant = scopes.filter((s) => !["openid", "profile", "offline_access"].includes(s));
      const extra = relevant.filter((s) => s !== "availability.read");
      out.push({
        group: g,
        label: "Zugang und Rechte",
        status: !relevant.includes("availability.read") ? "fail" : extra.length ? "warn" : "ok",
        detail: !relevant.includes("availability.read")
          ? `Scope availability.read fehlt (vorhanden: ${relevant.join(", ") || "keine"})`
          : extra.length
            ? `Scope-Client mit mehr Rechten als nötig: ${extra.join(", ")} – empfohlen: feingranularer Client mit core.unit_groups_availability.read`
            : "Token erhalten, Scope-Client nur mit availability.read (lesend)",
      });
    }
  } catch (e) {
    out.push({ group: g, label: "Zugang", status: "fail", detail: (e as Error).message });
    return out;
  }
  try {
    const from = addDays(todayInVenue(), 1);
    const to = addDays(from, 89);
    const blocked = await getApaleoBlockedDates(cfg.apaleo, from, to);
    out.push({
      group: g,
      label: `Verfügbarkeit ${cfg.apaleo.propertyId} / ${cfg.apaleo.unitGroupId}`,
      status: "ok",
      detail: `Nächste 90 Tage lückenlos geprüft; nicht ganztägig frei: ${blocked.length ? blocked.join(", ") : "keine"}`,
    });
  } catch (e) {
    out.push({ group: g, label: "Verfügbarkeit", status: "fail", detail: (e as Error).message });
  }
  // Gegenprobe: Zugriff auf andere Properties des Kontos muss abgelehnt werden (nur lesend).
  const others = OTHER_PROPERTIES.filter((p) => p !== cfg.apaleo.propertyId);
  if (others.length) {
    const day = addDays(todayInVenue(), 1);
    const results = await Promise.all(
      others.map(async (p) => {
        try {
          return [p, await probeOtherProperty(cfg.apaleo, p, day)] as const;
        } catch {
          return [p, 0] as const;
        }
      }),
    );
    const open = results.filter(([, st]) => st >= 200 && st < 300).map(([p]) => p);
    const unclear = results.filter(([, st]) => !(st >= 200 && st < 300) && st !== 403 && st !== 404).map(([p, st]) => `${p} (${st || "Fehler"})`);
    out.push({
      group: g,
      label: `Zugriff nur auf ${cfg.apaleo.propertyId}`,
      status: open.length ? "warn" : unclear.length ? "info" : "ok",
      detail: open.length
        ? `Zugang kann auch ${open.join(", ")} lesen – in apaleo auf ${cfg.apaleo.propertyId} beschränken`
        : unclear.length
          ? `Gegenprobe unklar: ${unclear.join(", ")}`
          : `Gegenprobe ${others.join(", ")}: kein Zugriff (wie gewünscht)`,
    });
  }
  return out;
}

/** Weitere Properties im apaleo-Konto (lesend ermittelt am 2026-11-01) für die Gegenprobe; per Variable änderbar. */
const OTHER_PROPERTIES = (process.env.APALEO_OTHER_PROPERTY_IDS ?? "ALPILA,HUESLE,LAEKE,TEST")
  .split(/[,\s]+/)
  .filter((p) => /^[A-Z0-9-]{2,20}$/.test(p));

async function txt(name: string): Promise<string[] | null> {
  try {
    return (await withTimeout(resolveTxt(name), 5000)).map((r) => r.join(""));
  } catch {
    return null;
  }
}

async function checkMail(cfg: LiveConfig): Promise<Check[]> {
  const g = "E-Mail (Resend)";
  const out: Check[] = [];
  const from = mailFromAddress(cfg.mail.from) ?? "";
  const domain = from.split("@")[1] ?? "";
  out.push({ group: g, label: "Absender", status: "info", detail: `${from} → Interne Empfänger: ${cfg.mail.internalTo.join(", ")}` });
  if (cfg.mail.transport === "log") {
    out.push({ group: g, label: "Versand", status: "fail", detail: "MAIL_TRANSPORT=log – es wird nichts versendet" });
    return out;
  }
  // DNS-Einträge, die Resend für die Domain verlangt (DKIM, SPF/Return-Path)
  const dkim = await txt(`resend._domainkey.${domain}`);
  out.push({ group: g, label: "DKIM (resend._domainkey)", status: dkim?.some((r) => /p=/.test(r)) ? "ok" : "fail", detail: dkim?.length ? "Eintrag vorhanden" : "Eintrag nicht gefunden" });
  const spf = await txt(`send.${domain}`);
  let mx: string[] = [];
  try {
    mx = (await withTimeout(resolveMx(`send.${domain}`), 5000)).map((r) => r.exchange);
  } catch {
    mx = [];
  }
  // Return-Path-Subdomain: SPF-Eintrag und MX müssen vorhanden sein (Ziel je nach Resend-Infrastruktur verschieden)
  const spfOk = !!spf?.some((r) => /^v=spf1\s/i.test(r));
  const mxOk = mx.length > 0;
  out.push({ group: g, label: "SPF / Return-Path (send.)", status: spfOk && mxOk ? "ok" : "fail", detail: `SPF ${spfOk ? "vorhanden" : "fehlt"}, MX ${mxOk ? "vorhanden" : "fehlt"}` });
  const dmarc = (await txt(`_dmarc.${domain}`)) ?? (await txt(`_dmarc.${domain.split(".").slice(-2).join(".")}`));
  out.push({ group: g, label: "DMARC", status: dmarc?.some((r) => /^v=DMARC1/i.test(r)) ? "ok" : "warn", detail: dmarc?.length ? "Eintrag vorhanden" : "kein Eintrag (empfohlen)" });
  // Domainstatus über die API (nur mit Vollzugriff möglich; ein reiner Sende-Key ist besser)
  try {
    const res = await withTimeout(fetch(`${cfg.mail.apiUrl}/domains`, { headers: { Authorization: `Bearer ${cfg.mail.apiKey}` }, cache: "no-store" }), 8000);
    const body = (await res.json().catch(() => null)) as { data?: { name?: string; status?: string }[]; name?: string } | null;
    if (res.ok) {
      const d = body?.data?.find((x) => x.name === domain);
      out.push({ group: g, label: "Domain in Resend", status: d?.status === "verified" ? "ok" : "fail", detail: d ? `Status: ${d.status}` : `Domain ${domain} nicht im Konto` });
      out.push({ group: g, label: "API-Key", status: "warn", detail: "Key hat Vollzugriff – für den Betrieb einen Key nur mit „Sending access“ empfohlen" });
    } else if (body?.name === "restricted_api_key") {
      out.push({ group: g, label: "API-Key", status: "ok", detail: "gültig, nur Senden erlaubt (empfohlen); Domainstatus über DNS geprüft – Test-E-Mail senden zur Bestätigung" });
    } else {
      out.push({ group: g, label: "API-Key", status: "fail", detail: `abgelehnt (HTTP ${res.status}${body?.name ? ` ${body.name}` : ""})` });
    }
  } catch {
    out.push({ group: g, label: "API-Key", status: "fail", detail: "Resend nicht erreichbar" });
  }
  return out;
}

export async function runSelftest(
  opts: { applySchema?: boolean; public?: boolean } = {},
): Promise<{ checks: Check[]; ready: boolean; mode: string }> {
  const checks: Check[] = [];
  const state = getModeState();
  const raw = rawBookingMode();
  checks.push({
    group: "Betriebsart",
    label: "Aktuell",
    status: state.mode === "live" ? "ok" : state.mode === "demo" ? "info" : "fail",
    detail:
      state.mode === "live"
        ? "Live"
        : state.mode === "demo"
          ? `Demo (BOOKING_MODE ${raw ? `= ${raw}` : "nicht gesetzt"}) – nach erfolgreichem Selbsttest BOOKING_MODE=live setzen und neu deployen`
          : `Gesperrt: ${state.problems.join(", ")}`,
  });
  const live = readLiveConfig();
  checks.push({
    group: "Konfiguration",
    label: "Pflichtvariablen",
    status: live.config ? "ok" : "fail",
    detail: live.config ? `vollständig (Umgebung: ${live.config.environment})` : live.problems.join(", "),
  });
  const cron = (process.env.CRON_SECRET ?? "").trim();
  checks.push({ group: "Konfiguration", label: "CRON_SECRET", status: cron.length >= 16 ? "ok" : "warn", detail: cron.length >= 16 ? "gesetzt" : "fehlt oder zu kurz – automatische E-Mail-Wiederholung inaktiv" });
  const origins = getEmbedAllowedOrigins();
  checks.push({
    group: "Konfiguration",
    label: "EMBED_ALLOWED_ORIGINS",
    status: origins.includes("https://unique-places.com") ? "ok" : "fail",
    detail: origins.length ? origins.join(" ") : "leer – WordPress-Einbindung blockiert",
  });
  checks.push({ group: "Konfiguration", label: "Datenschutz-Link", status: "info", detail: getPrivacyUrl() });
  if (live.config) {
    // Im Live-Betrieb wird das Schema ohnehin beim ersten Zugriff angelegt (mit Schutz vor fremden Tabellen).
    const applySchema = !!opts.applySchema || state.mode === "live";
    const [db, ap, mail] = await Promise.all([checkDatabase(live.config, applySchema, !!opts.public), checkApaleo(live.config), checkMail(live.config)]);
    checks.push(...ap, ...mail, ...db);
  }
  return { checks, ready: !!live.config && !checks.some((c) => c.status === "fail" && c.group !== "Betriebsart"), mode: state.mode };
}
