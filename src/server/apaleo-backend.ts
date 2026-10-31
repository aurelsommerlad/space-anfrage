import "server-only";
import { addDays, eachDay, type IsoDate } from "@/lib/dates";
import type { LiveConfig } from "./config";
import { log } from "./log";

/**
 * apaleo-Verfügbarkeit (nur lesend).
 *
 * Grundlage: apaleo Availability API v1, GET /availability/v1/unit-groups
 * (https://api.apaleo.com/swagger/availability-v1/swagger.json), Scope
 * "availability.read", Token über OAuth2 Client Credentials
 * (https://identity.apaleo.com/connect/token).
 *
 * Abgleich mit den echten Daten von ALTUS (lesend geprüft):
 *  - SPACE = Kategorie ALTUS-SPACE (MeetingRoom, 1 Einheit ALTUS-SIQ)
 *  - Zeitscheiben: ALTUS-DAY (DayUse 10–16 Uhr), ALTUS-NIGHT (OverNight 16–10 Uhr)
 *  - Reservierungen sind Tagesnutzungen (Rate ALTUS-STD-SPACE, DayUse).
 *  - Wartungen/Sperren können beliebige Zeiten haben; apaleo zählt sie in jeder
 *    Zeitscheibe, die sie überschneiden (z. B. Sperre bis 10 Uhr → Nachtscheibe
 *    des Vortags).
 *
 * Ein Kalendertag D gilt nur dann als frei, wenn die SPACE den GANZEN Tag
 * (00:00–24:00 Uhr) frei ist. Das decken drei Zeitscheiben lückenlos ab:
 *    OverNight(D-1)  [D-1 16:00, D 10:00)   → 00:00–10:00 Uhr
 *    DayUse(D)       [D 10:00,   D 16:00)   → 10:00–16:00 Uhr
 *    OverNight(D)    [D 16:00,   D+1 10:00) → 16:00–24:00 Uhr
 * Damit sind alle wählbaren Zeiten (06:00–24:00) inklusive Auf- und Abbau am
 * selben Tag geprüft. Die Lückenlosigkeit wird bei jeder Abfrage anhand der
 * gelieferten Zeitstempel kontrolliert; ändert sich die Konfiguration in apaleo
 * so, dass eine Lücke entsteht, ist das ein Fehler ("nicht prüfbar").
 *
 * "Verfügbar" heißt: availableCount ≥ 1, keine Wartung (out of service/order/
 * inventory) und keine Block-Belegung (definite/tentative/optional).
 *
 * Fehler (Netzwerk, Zeitüberschreitung, HTTP-Fehler, unerwartete oder
 * unvollständige Antwort, fehlende Tage, Lücken) führen zu
 * ApaleoUnavailableError – nie zu "frei" und nie zu "belegt".
 */

export class ApaleoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApaleoUnavailableError";
  }
}

const TIMEOUT_MS = 8000;

type Cfg = LiveConfig["apaleo"];

let token: { value: string; expires: number; key: string } | null = null;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

async function getToken(cfg: Cfg): Promise<string> {
  const key = `${cfg.identityUrl}|${cfg.clientId}`;
  if (token && token.key === key && token.expires > Date.now() + 60_000) return token.value;
  let res: Response;
  try {
    res = await fetchWithTimeout(`${cfg.identityUrl}/connect/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`).toString("base64"),
      },
      body: "grant_type=client_credentials",
    });
  } catch (e) {
    throw new ApaleoUnavailableError(`Token-Abruf fehlgeschlagen (${(e as Error).name})`);
  }
  if (!res.ok) throw new ApaleoUnavailableError(`Token-Abruf: HTTP ${res.status}`);
  const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!body?.access_token) throw new ApaleoUnavailableError("Token-Abruf: unerwartete Antwort");
  token = { value: body.access_token, expires: Date.now() + (body.expires_in ?? 600) * 1000, key };
  return token.value;
}

interface Counts {
  availableCount?: unknown;
  maintenance?: { outOfService?: unknown; outOfOrder?: unknown; outOfInventory?: unknown };
  block?: { definite?: unknown; tentative?: unknown; optional?: unknown };
}
interface TimeSlice {
  from?: unknown;
  to?: unknown;
  unitGroups?: (Counts & { unitGroup?: { id?: string } })[];
}
interface Slice {
  from: number;
  to: number;
  free: boolean;
}

const num = (v: unknown, fallback?: number): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v === undefined && fallback !== undefined) return fallback;
  throw new ApaleoUnavailableError("Verfügbarkeit: unvollständige Angaben in der Antwort");
};

/** Frei/belegt einer Zeitscheibe. Fehlende Pflichtangaben sind ein Fehler, kein "belegt". */
function sliceIsFree(c: Counts): boolean {
  const available = num(c.availableCount);
  const m = c.maintenance ?? {};
  const b = c.block ?? {};
  const maintenance = num(m.outOfService, 0) + num(m.outOfOrder, 0) + num(m.outOfInventory, 0);
  const blocked = num(b.definite, 0) + num(b.tentative, 0) + num(b.optional, 0);
  return available >= 1 && maintenance === 0 && blocked === 0;
}

/** Fragt eine Zeitscheiben-Vorlage für from..to (inkl.) ab; Schlüssel = lokales Datum des Scheibenbeginns. */
async function fetchTemplate(cfg: Cfg, template: "DayUse" | "OverNight", from: IsoDate, to: IsoDate): Promise<Map<IsoDate, Slice>> {
  const url = new URL("/availability/v1/unit-groups", cfg.apiUrl);
  url.searchParams.set("propertyId", cfg.propertyId);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("timeSliceTemplate", template);
  url.searchParams.set("unitGroupIds", cfg.unitGroupId);
  url.searchParams.set("pageSize", "500");

  const attempt = async () => {
    const access = await getToken(cfg);
    return fetchWithTimeout(url.toString(), { headers: { Authorization: `Bearer ${access}`, Accept: "application/json" } });
  };
  let res: Response;
  try {
    res = await attempt();
    if (res.status === 401) {
      token = null; // abgelaufenes Token: einmal erneuern
      res = await attempt();
    }
  } catch (e) {
    if (e instanceof ApaleoUnavailableError) throw e;
    throw new ApaleoUnavailableError(`Verfügbarkeit: ${(e as Error).name}`);
  }
  if (res.status === 204) throw new ApaleoUnavailableError("Verfügbarkeit: keine Daten (204)");
  if (!res.ok) throw new ApaleoUnavailableError(`Verfügbarkeit: HTTP ${res.status}`);
  const body = (await res.json().catch(() => null)) as { timeSlices?: TimeSlice[] } | null;
  if (!body || !Array.isArray(body.timeSlices)) throw new ApaleoUnavailableError("Verfügbarkeit: unerwartete Antwort");

  const result = new Map<IsoDate, Slice>();
  for (const ts of body.timeSlices) {
    const f = typeof ts.from === "string" ? Date.parse(ts.from) : NaN;
    const t = typeof ts.to === "string" ? Date.parse(ts.to) : NaN;
    if (!Number.isFinite(f) || !Number.isFinite(t) || t <= f) throw new ApaleoUnavailableError("Verfügbarkeit: ungültige Zeitscheibe");
    // Kalendertag = lokales Datum am Beginn der Zeitscheibe (ISO mit Offset der Property)
    const day = (ts.from as string).slice(0, 10);
    const ug = ts.unitGroups?.find((u) => u.unitGroup?.id === cfg.unitGroupId);
    if (!ug) throw new ApaleoUnavailableError("Verfügbarkeit: Kategorie fehlt in der Antwort");
    result.set(day, { from: f, to: t, free: sliceIsFree(ug) });
  }
  return result;
}

/** Lokale Mitternacht (Europe/Berlin) am Beginn von `day` als Zeitpunkt. */
function berlinMidnight(day: IsoDate): number {
  // Offset um 00:00 UTC bestimmen – liegt vor der Umstellung (2/3 Uhr), gilt also für Mitternacht.
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(new Date(utcMidnight));
  return utcMidnight - Number(hour) * 3_600_000; // Berlin ist UTC+1 bzw. UTC+2
}

/**
 * Belegte (nicht ganztägig freie) Tage im Zeitraum from..to (jeweils inklusive).
 * Wirft ApaleoUnavailableError, wenn die Verfügbarkeit nicht vollständig prüfbar ist.
 */
export async function getApaleoBlockedDates(cfg: Cfg, from: IsoDate, to: IsoDate): Promise<IsoDate[]> {
  const [day, night] = await Promise.all([
    fetchTemplate(cfg, "DayUse", from, to),
    fetchTemplate(cfg, "OverNight", addDays(from, -1), to),
  ]);
  const blocked: IsoDate[] = [];
  for (const d of eachDay(from, to)) {
    const before = night.get(addDays(d, -1));
    const dayUse = day.get(d);
    const evening = night.get(d);
    // Fehlende Tage in der Antwort sind ein Fehler – weder "frei" noch "belegt".
    if (!before || !dayUse || !evening) throw new ApaleoUnavailableError("Verfügbarkeit: Tag fehlt in der Antwort");
    // Lückenlose Abdeckung 00:00–24:00 Uhr kontrollieren
    const start = berlinMidnight(d);
    const end = berlinMidnight(addDays(d, 1));
    const covered = before.from <= start && before.to >= dayUse.from && dayUse.to >= evening.from && evening.to >= end;
    if (!covered) throw new ApaleoUnavailableError("Verfügbarkeit: Zeitscheiben decken den Tag nicht lückenlos ab");
    if (!before.free || !dayUse.free || !evening.free) blocked.push(d);
  }
  return blocked;
}

/* ---- Kurzzeit-Cache für die Kalenderansicht (nicht für das Absenden) ---- */
const cache = new Map<string, { at: number; data: IsoDate[] }>();
const CACHE_MS = 60_000;

export async function getApaleoBlockedDatesCached(cfg: Cfg, from: IsoDate, to: IsoDate): Promise<IsoDate[]> {
  const key = `${from}|${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  try {
    const data = await getApaleoBlockedDates(cfg, from, to);
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return data;
  } catch (e) {
    log.error("apaleo.availability_failed", { from, to, reason: (e as Error).message });
    throw e;
  }
}

/**
 * Selbsttest: holt ein frisches Token und liest die gewährten Scopes aus dem
 * JWT (ohne das Token selbst preiszugeben).
 */
export async function checkApaleoAccess(cfg: Cfg): Promise<{ scopes: string[] | null }> {
  token = null;
  const access = await getToken(cfg);
  try {
    const payload = JSON.parse(Buffer.from(access.split(".")[1] ?? "", "base64url").toString("utf8")) as { scope?: string | string[] };
    const scope = payload.scope;
    return { scopes: Array.isArray(scope) ? scope : typeof scope === "string" ? scope.split(" ") : null };
  } catch {
    return { scopes: null };
  }
}

/** Nur für Tests: Zwischenspeicher leeren. */
export function resetApaleoCaches() {
  cache.clear();
  token = null;
}

