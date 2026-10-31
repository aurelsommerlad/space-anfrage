import "server-only";
import { eachDay, type IsoDate } from "@/lib/dates";
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
 *  - Buchungen sind Tagesnutzungen (Zeitscheibe "Day Use" 10–16 Uhr),
 *    je Veranstaltungstag eine Reservierung.
 *
 * Ein Tag gilt nur dann als frei, wenn die SPACE GANZTÄGIG frei ist:
 *  - Tageszeitscheibe (DayUse) dieses Tages: verfügbar, und
 *  - Nachtzeitscheibe (OverNight), die an diesem Tag beginnt: verfügbar
 *    (deckt Abendveranstaltungen und Sperren ab 16 Uhr ab).
 * "Verfügbar" heißt: availableCount ≥ 1, keine Wartung (out of service/order/
 * inventory) und keine Block-Belegung (definite/tentative/optional).
 *
 * Jeder Fehler (Netzwerk, Zeitüberschreitung, HTTP-Fehler, unerwartete Antwort,
 * fehlende Tage) führt zu einer Ausnahme – nie zu "verfügbar".
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
  availableCount?: number;
  maintenance?: { outOfService?: number; outOfOrder?: number; outOfInventory?: number };
  block?: { definite?: number; tentative?: number; optional?: number; remaining?: number };
}
interface TimeSlice {
  from: string;
  to: string;
  unitGroups?: (Counts & { unitGroup?: { id?: string } })[];
}

function sliceIsFree(c: Counts | undefined): boolean {
  if (!c || typeof c.availableCount !== "number") return false;
  const m = c.maintenance ?? {};
  const b = c.block ?? {};
  const maintenance = (m.outOfService ?? 0) + (m.outOfOrder ?? 0) + (m.outOfInventory ?? 0);
  const blocked = (b.definite ?? 0) + (b.tentative ?? 0) + (b.optional ?? 0);
  return c.availableCount >= 1 && maintenance === 0 && blocked === 0;
}

/** Fragt eine Zeitscheiben-Vorlage für from..to (inkl.) ab und liefert je Tag frei/belegt. */
async function fetchTemplate(cfg: Cfg, template: "DayUse" | "OverNight", from: IsoDate, to: IsoDate): Promise<Map<IsoDate, boolean>> {
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

  const result = new Map<IsoDate, boolean>();
  for (const ts of body.timeSlices) {
    // Kalendertag = lokales Datum am Beginn der Zeitscheibe (ISO mit Offset der Property)
    const day = typeof ts.from === "string" ? ts.from.slice(0, 10) : "";
    const ug = ts.unitGroups?.find((u) => u.unitGroup?.id === cfg.unitGroupId);
    result.set(day, sliceIsFree(ug));
  }
  return result;
}

/** Belegte (nicht ganztägig freie) Tage im Zeitraum from..to (jeweils inklusive). */
export async function getApaleoBlockedDates(cfg: Cfg, from: IsoDate, to: IsoDate): Promise<IsoDate[]> {
  const [day, night] = await Promise.all([fetchTemplate(cfg, "DayUse", from, to), fetchTemplate(cfg, "OverNight", from, to)]);
  const blocked: IsoDate[] = [];
  for (const d of eachDay(from, to)) {
    const dayFree = day.get(d);
    const nightFree = night.get(d);
    // Fehlende Tage in der Antwort sind ein Fehler – nie "frei".
    if (dayFree === undefined || nightFree === undefined) {
      throw new ApaleoUnavailableError(`Verfügbarkeit: Tag fehlt in der Antwort`);
    }
    if (!dayFree || !nightFree) blocked.push(d);
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

/** Nur für Tests: Zwischenspeicher leeren. */
export function resetApaleoCaches() {
  cache.clear();
  token = null;
}

