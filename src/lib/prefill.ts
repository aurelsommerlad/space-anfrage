/**
 * Vorbelegung über URL-Parameter (Anfrageleiste auf der SPACE-Seite).
 *
 * Erlaubt sind ausschließlich diese Parameter – keine personenbezogenen Daten:
 *   beginn=YYYY-MM-DD   erster Tag (Pflicht für eine Vorbelegung des Termins)
 *   ende=YYYY-MM-DD     letzter Tag (optional, nur bei mehreren Tagen)
 *   personen=N          Personenzahl (optional)
 */
import { compareDates, formatDateShort, formatMonth, formatRange, isIsoDate, monthOf, type IsoDate } from "./dates";

export const PREFILL_PARAMS = { start: "beginn", end: "ende", guests: "personen" } as const;

export type PrefillDateIssue = "missing" | "invalid" | "order" | "too-soon" | "too-far" | "booked" | "unchecked";

export interface PrefillResult {
  /** Gültiger, freier Termin – sonst null. */
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  /** Angefragter Zeitraum (auch wenn belegt), für die Monatsanzeige. */
  requestedStart: IsoDate | null;
  /** Wurde ein Zeitraum über mehrere Tage angefragt? */
  requestedMultiDay: boolean;
  /** Gültige Personenzahl als String – sonst "". */
  guests: string;
  guestsGiven: boolean;
  dateIssue: PrefillDateIssue | null;
  guestsIssue: boolean;
  conflictDates: IsoDate[];
  /** Verständliche Meldung zum Termin (bei dateIssue). */
  message: string | null;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === undefined) return undefined;
  return s.trim().slice(0, 32);
}

/** Liest nur die erlaubten Parameter. null = keine Vorbelegung. */
export function readPrefillParams(sp: SearchParams) {
  const start = first(sp[PREFILL_PARAMS.start]);
  const end = first(sp[PREFILL_PARAMS.end]);
  const guests = first(sp[PREFILL_PARAMS.guests]);
  if (!start && !end && !guests) return null;
  return { start: start || undefined, end: end || undefined, guests: guests || undefined };
}

export type PrefillParams = NonNullable<ReturnType<typeof readPrefillParams>>;

/** Prüft Format und Grenzen (ohne Belegung). */
export function checkPrefill(
  params: PrefillParams,
  bounds: { earliest: IsoDate; latest: IsoDate },
): PrefillResult {
  const r: PrefillResult = {
    startDate: null,
    endDate: null,
    requestedStart: null,
    requestedMultiDay: false,
    guests: "",
    guestsGiven: params.guests !== undefined,
    dateIssue: null,
    guestsIssue: false,
    conflictDates: [],
    message: null,
  };

  if (params.guests !== undefined) {
    const ok = /^\d{1,4}$/.test(params.guests) && Number(params.guests) >= 1;
    if (ok) r.guests = String(Number(params.guests));
    else r.guestsIssue = true;
  }

  const { start, end } = params;
  r.requestedMultiDay = !!start && !!end && end !== start;
  if (!start) {
    if (end) {
      r.dateIssue = "missing";
      r.message = "Bitte wähle deinen Wunschtermin im Kalender.";
    }
    return r;
  }
  if (!isIsoDate(start) || (end !== undefined && !isIsoDate(end))) {
    r.dateIssue = "invalid";
    r.message = "Das übergebene Datum ist ungültig. Bitte wähle deinen Wunschtermin im Kalender.";
    return r;
  }
  const last = end ?? start;
  r.requestedStart = start;
  if (compareDates(last, start) < 0) {
    r.dateIssue = "order";
    r.message = "Das Ende liegt vor dem Beginn. Bitte wähle deinen Zeitraum im Kalender neu.";
    return r;
  }
  if (compareDates(start, bounds.earliest) < 0) {
    r.dateIssue = "too-soon";
    r.requestedStart = null;
    r.message = `Der gewünschte Termin liegt in der Vergangenheit oder ist zu kurzfristig. Anfragen sind ab ${formatDateShort(bounds.earliest)} möglich – bitte wähle einen anderen Termin.`;
    return r;
  }
  if (compareDates(last, bounds.latest) > 0) {
    r.dateIssue = "too-far";
    r.requestedStart = null;
    r.message = `Anfragen sind bis einschließlich ${formatMonth(monthOf(bounds.latest))} möglich. Bitte wähle einen früheren Termin.`;
    return r;
  }
  r.startDate = start;
  r.endDate = last;
  return r;
}

/** Ergänzt das Ergebnis um die Belegung. */
export function applyBooked(r: PrefillResult, booked: IsoDate[] | null): PrefillResult {
  if (!r.startDate || !r.endDate) return r;
  const range = formatRange(r.startDate, r.endDate === r.startDate ? null : r.endDate);
  if (booked === null) {
    return {
      ...r,
      startDate: null,
      endDate: null,
      dateIssue: "unchecked",
      message: `Die Verfügbarkeit für ${range} konnte gerade nicht geprüft werden. Bitte wähle deinen Termin im Kalender.`,
    };
  }
  if (booked.length === 0) return r;
  const single = r.startDate === r.endDate;
  const days = booked.map((d) => formatDateShort(d));
  const message = single
    ? `Am ${days[0]} ist der Raum leider bereits belegt. Bitte wähle einen anderen Tag.`
    : booked.length === 1
      ? `Im Zeitraum ${range} ist der Raum am ${days[0]} bereits belegt. Bitte wähle einen anderen Zeitraum.`
      : `Im Zeitraum ${range} ist der Raum an ${booked.length} Tagen bereits belegt. Bitte wähle einen anderen Zeitraum.`;
  return { ...r, startDate: null, endDate: null, dateIssue: "booked", conflictDates: booked, message };
}

export const GUESTS_PREFILL_ERROR = "Die übergebene Personenzahl ist ungültig. Bitte gib eine ganze Zahl ab 1 an.";
