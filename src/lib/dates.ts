/**
 * Datumslogik für die Buchungsanfrage.
 *
 * Grundsatz: Kalendertage werden als reine Datumswerte ("YYYY-MM-DD") geführt.
 * Sie beziehen sich immer auf die lokale Zeit am Veranstaltungsort
 * (Europe/Berlin). Für Berechnungen werden sie als UTC-Mitternacht
 * interpretiert, damit Sommer-/Winterzeitwechsel keine Tage verschieben.
 *
 * Diese Datei hat bewusst keine Imports, damit sie in Client, Server und
 * Tests gleichermaßen verwendet werden kann.
 */

export const VENUE_TIME_ZONE = "Europe/Berlin";

/** ISO-Datum ohne Uhrzeit, z. B. "2026-11-05". */
export type IsoDate = string;
/** Monat, z. B. "2026-11". */
export type IsoMonth = string;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH_RE = /^(\d{4})-(\d{2})$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string") return false;
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return toIsoDate(d) === value;
}

export function isIsoMonth(value: unknown): value is IsoMonth {
  if (typeof value !== "string") return false;
  const m = ISO_MONTH_RE.exec(value);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

function toIsoDate(d: Date): IsoDate {
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parse(date: IsoDate): Date {
  const m = ISO_DATE_RE.exec(date);
  if (!m) throw new Error(`Ungültiges Datum: ${date}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Heutiges Datum am Veranstaltungsort (Europe/Berlin). */
export function todayInVenue(now: Date = new Date()): IsoDate {
  // en-CA liefert das Format YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VENUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Anzahl Kalendertage von a bis einschließlich b. */
export function daysInclusive(a: IsoDate, b: IsoDate): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000) + 1;
}

/** Alle Tage von start bis einschließlich end. */
export function eachDay(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7);
}

export function addMonths(month: IsoMonth, delta: number): IsoMonth {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return toIsoDate(d).slice(0, 7);
}

export function firstOfMonth(month: IsoMonth): IsoDate {
  return `${month}-01`;
}

export function lastOfMonth(month: IsoMonth): IsoDate {
  return addDays(firstOfMonth(addMonths(month, 1)), -1);
}

/** Wochentag mit Montag = 0 … Sonntag = 6. */
export function weekdayMondayFirst(date: IsoDate): number {
  return (parse(date).getUTCDay() + 6) % 7;
}

/**
 * Kalenderraster eines Monats (Wochen ab Montag). Tage außerhalb des Monats
 * sind null.
 */
export function monthGrid(month: IsoMonth): (IsoDate | null)[][] {
  const first = firstOfMonth(month);
  const last = lastOfMonth(month);
  const cells: (IsoDate | null)[] = Array(weekdayMondayFirst(first)).fill(null);
  for (const d of eachDay(first, last)) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (IsoDate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ---------------------------------------------------------------------------
// Formatierung (Deutsch). Da IsoDate als UTC-Mitternacht geparst wird, wird
// hier mit timeZone "UTC" formatiert – der Kalendertag bleibt so exakt erhalten.
// ---------------------------------------------------------------------------

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("de-DE", { ...options, timeZone: "UTC" });
    fmtCache.set(key, f);
  }
  return f;
}

/** "Do., 5. Nov. 2026" */
export function formatDateShort(date: IsoDate): string {
  return fmt({ weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(parse(date));
}

/** "Donnerstag, 5. November 2026" */
export function formatDateLong(date: IsoDate): string {
  return fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parse(date));
}

/** "November 2026" */
export function formatMonth(month: IsoMonth): string {
  return fmt({ month: "long", year: "numeric" }).format(parse(firstOfMonth(month)));
}

/** "5.–7. Nov. 2026" bzw. "30. Okt. – 2. Nov. 2026" */
export function formatRange(start: IsoDate, end: IsoDate | null): string {
  if (!end || end === start) return formatDateShort(start);
  const s = parse(start);
  const e = parse(end);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth();
  const endStr = fmt({ day: "numeric", month: "short", year: "numeric" }).format(e);
  if (sameMonth) return `${s.getUTCDate()}.–${endStr}`;
  if (sameYear) return `${fmt({ day: "numeric", month: "short" }).format(s)} – ${endStr}`;
  return `${fmt({ day: "numeric", month: "short", year: "numeric" }).format(s)} – ${endStr}`;
}

export const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
export const WEEKDAY_LONG = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

// ---------------------------------------------------------------------------
// Uhrzeiten
// ---------------------------------------------------------------------------

/** "HH:MM" im 24-Stunden-Format. */
export type TimeOfDay = string;

export function isTimeOfDay(value: unknown): value is TimeOfDay {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value);
}

export function timeToMinutes(t: TimeOfDay): number {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/**
 * Wandelt Datum + lokale Uhrzeit am Veranstaltungsort in einen ISO-Zeitstempel
 * mit korrektem Offset um (z. B. "2026-11-05T09:00:00+01:00").
 * Grundlage für die spätere Übergabe an apaleo.
 */
export function venueDateTimeToIso(date: IsoDate, time: TimeOfDay): string {
  let day = date;
  let t = time;
  if (t === "24:00") {
    day = addDays(date, 1);
    t = "00:00";
  }
  const [h, min] = t.split(":").map(Number) as [number, number];
  const [y, mo, d] = day.split("-").map(Number) as [number, number, number];
  // Erst als UTC annehmen, dann Offset der Zielzone an diesem Zeitpunkt ermitteln.
  const guess = Date.UTC(y, mo - 1, d, h, min);
  let offset = offsetMinutes(new Date(guess));
  // Zweiter Durchlauf für Zeitpunkte nahe der Zeitumstellung.
  offset = offsetMinutes(new Date(guess - offset * 60_000));
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const oh = String(Math.floor(abs / 60)).padStart(2, "0");
  const om = String(abs % 60).padStart(2, "0");
  return `${day}T${t}:00${sign}${oh}:${om}`;
}

function offsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: VENUE_TIME_ZONE,
    timeZoneName: "longOffset",
  }).formatToParts(at);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0;
  const v = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -v : v;
}
