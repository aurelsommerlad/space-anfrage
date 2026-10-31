/**
 * Fachmodell und Validierung der Buchungsanfrage.
 * Wird von Oberfläche (Client) und API-Routen (Server) gemeinsam genutzt.
 */
import { z } from "zod";
import { compareDates, isIsoDate, isTimeOfDay, timeToMinutes, type IsoDate } from "./dates";

export const VENUE = {
  name: "SPACE im HØV",
  location: "Altusried",
  operator: "UNIQUE PLACES",
  areaSqm: 63,
  feature: "mit großer Küche",
} as const;

export const OCCASIONS = [
  { id: "seminar", label: "Seminar & Workshop" },
  { id: "teamtag", label: "Teamtag & Retreat" },
  { id: "feier", label: "Private Feier" },
  { id: "anderes", label: "Etwas anderes" },
] as const;

export type OccasionId = (typeof OCCASIONS)[number]["id"];
const OCCASION_IDS = OCCASIONS.map((o) => o.id) as [OccasionId, ...OccasionId[]];

export function occasionLabel(id: OccasionId | "" | null | undefined): string {
  return OCCASIONS.find((o) => o.id === id)?.label ?? "";
}

/** Wählbare Uhrzeiten im 30-Minuten-Raster. Anpassbar, sobald feste Zeiten feststehen. */
export const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let m = 6 * 60; m <= 24 * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
})();

/** Frühester anfragbarer Tag relativ zu heute (1 = ab morgen). */
export const MIN_LEAD_DAYS = 1;

/** Wie viele Monate im Voraus angefragt werden kann (Kalendernavigation). */
export const MAX_MONTHS_AHEAD = 24;

export const MESSAGE_MAX_LENGTH = 2000;

/** Formularzustand – alle Felder als Strings/Booleans, wie sie in der Oberfläche vorliegen. */
export interface BookingDraft {
  /** true = Zeitraum über mehrere Tage, false = einzelner Tag. */
  multiDay: boolean;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  startTime: string;
  endTime: string;
  occasion: OccasionId | "";
  guests: string;
  message: string;
  overnight: boolean;
  name: string;
  email: string;
  company: string;
  phone: string;
  /**
   * true, wenn der Termin über die Anfrageleiste (URL-Parameter) kam: Die
   * Uhrzeit wird dann im Schritt "Anlass" abgefragt, damit der Ablauf direkt
   * dort beginnen kann.
   */
  timeInOccasionStep: boolean;
}

export const EMPTY_DRAFT: BookingDraft = {
  multiDay: false,
  startDate: null,
  endDate: null,
  startTime: "",
  endTime: "",
  occasion: "",
  guests: "",
  message: "",
  overnight: false,
  name: "",
  email: "",
  company: "",
  phone: "",
  timeInOccasionStep: false,
};

export type FieldErrors = Partial<Record<keyof BookingDraft, string>>;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const dateSchema = z.string().refine(isIsoDate, "Bitte wähle ein gültiges Datum.");
const timeSchema = z
  .string({ error: "Bitte wähle eine Uhrzeit." })
  .min(1, "Bitte wähle eine Uhrzeit.")
  .refine(isTimeOfDay, "Bitte wähle eine gültige Uhrzeit.");

export const dateStepSchema = z
  .object({
    multiDay: z.boolean(),
    startDate: dateSchema.nullable(),
    endDate: dateSchema.nullable(),
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .superRefine((v, ctx) => {
    if (!v.startDate) {
      ctx.addIssue({ code: "custom", path: ["startDate"], message: "Bitte wähle im Kalender einen Tag aus." });
      return;
    }
    if (v.multiDay && !v.endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Bitte wähle im Kalender noch den letzten Tag deines Zeitraums.",
      });
      return;
    }
    const end = v.endDate ?? v.startDate;
    if (v.multiDay && end === v.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Für mehrere Tage wähle einen späteren letzten Tag – oder wechsle zu „Ein Tag“.",
      });
    }
    if (compareDates(end, v.startDate) < 0) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "Das Enddatum liegt vor dem Startdatum." });
    }
    if (
      end === v.startDate &&
      isTimeOfDay(v.startTime) &&
      isTimeOfDay(v.endTime) &&
      timeToMinutes(v.endTime) <= timeToMinutes(v.startTime)
    ) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Die Endzeit muss nach der Startzeit liegen." });
    }
  });

export const occasionStepSchema = z.object({
  occasion: z.enum(OCCASION_IDS, { error: "Bitte wähle einen Anlass." }),
  guests: z
    .string()
    .trim()
    .min(1, "Bitte gib an, mit wie vielen Personen ihr plant.")
    .refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 9999, "Bitte gib eine ganze Zahl ab 1 an."),
  message: z.string().max(MESSAGE_MAX_LENGTH, `Bitte fasse dich kürzer (höchstens ${MESSAGE_MAX_LENGTH} Zeichen).`),
  overnight: z.boolean(),
});

export const contactStepSchema = z.object({
  name: z.string().trim().min(2, "Bitte gib deinen Namen an.").max(120, "Der Name ist zu lang."),
  email: z
    .string()
    .trim()
    .min(1, "Bitte gib deine E-Mail-Adresse an.")
    .pipe(z.email("Bitte prüfe deine E-Mail-Adresse, z. B. name@beispiel.de.")),
  company: z.string().trim().max(160, "Der Name des Unternehmens ist zu lang."),
  phone: z
    .string()
    .trim()
    .max(40, "Die Telefonnummer ist zu lang.")
    .refine((v) => v === "" || /^\+?[0-9 ()/.-]{5,}$/.test(v), "Bitte prüfe die Telefonnummer, z. B. +49 831 123456."),
});

export const STEP_SCHEMAS = [dateStepSchema, occasionStepSchema, contactStepSchema] as const;
export type StepIndex = 0 | 1 | 2;

/** Vollständige Anfrage, wie sie an den Server geht. */
export const bookingRequestSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  occasion: occasionStepSchema.shape.occasion,
  guests: z.number().int().min(1).max(9999),
  message: occasionStepSchema.shape.message,
  overnight: z.boolean(),
  name: contactStepSchema.shape.name,
  email: contactStepSchema.shape.email,
  company: contactStepSchema.shape.company,
  phone: contactStepSchema.shape.phone,
  /** Honeypot gegen einfache Bots – muss leer bleiben. */
  website: z.string().max(0).optional(),
});

export type BookingRequest = z.infer<typeof bookingRequestSchema>;

function collectErrors(schema: z.ZodType, draft: BookingDraft): FieldErrors {
  const result = schema.safeParse(draft);
  if (result.success) return {};
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof BookingDraft | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** Schritt, in dem die Uhrzeit abgefragt wird. */
export function timeStep(draft: BookingDraft): StepIndex {
  return draft.timeInOccasionStep ? 1 : 0;
}

export function validateStep(step: StepIndex, draft: BookingDraft): FieldErrors {
  const errors = collectErrors(STEP_SCHEMAS[step], draft);
  if (draft.timeInOccasionStep) {
    if (step === 0) {
      delete errors.startTime;
      delete errors.endTime;
    } else if (step === 1 && draft.startDate) {
      const t = collectErrors(dateStepSchema, draft);
      const timeErrors: FieldErrors = {};
      if (t.startTime) timeErrors.startTime = t.startTime;
      if (t.endTime) timeErrors.endTime = t.endTime;
      return { ...timeErrors, ...errors };
    }
  }
  return errors;
}

export function draftToRequest(draft: BookingDraft): BookingRequest {
  const start = draft.startDate ?? "";
  return {
    startDate: start,
    endDate: draft.multiDay ? (draft.endDate ?? start) : start,
    startTime: draft.startTime,
    endTime: draft.endTime,
    occasion: draft.occasion as OccasionId,
    guests: Number(draft.guests),
    message: draft.message.trim(),
    overnight: draft.overnight,
    name: draft.name.trim(),
    email: draft.email.trim(),
    company: draft.company.trim(),
    phone: draft.phone.trim(),
  };
}
