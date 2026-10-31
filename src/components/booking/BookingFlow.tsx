"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  draftToRequest,
  EMPTY_DRAFT,
  validateStep,
  VENUE,
  type BookingDraft,
  type FieldErrors,
  type StepIndex,
} from "@/lib/booking";
import { addMonths, eachDay, formatDateShort, formatRange, monthOf, type IsoDate, type IsoMonth } from "@/lib/dates";
import type { AvailabilityResponse, SubmitErrorResponse, SubmitResponse } from "@/lib/availability";
import { Confirmation } from "./Confirmation";
import { fieldId } from "./fields";
import { StepContact } from "./StepContact";
import { StepDate } from "./StepDate";
import { StepOccasion } from "./StepOccasion";
import { SummaryAside, SummaryCompact } from "./Summary";
import { useEmbedBridge, type ParentViewport } from "./useEmbedBridge";
import { GUESTS_PREFILL_ERROR, type PrefillResult } from "@/lib/prefill";
import styles from "./booking.module.css";

export interface BookingFlowInitial {
  today: IsoDate;
  earliestDate: IsoDate;
  initialMonth: IsoMonth;
  bookedDates: IsoDate[];
  loadedMonths: IsoMonth[];
  demo: boolean;
  /** Live gewählt, aber unvollständig konfiguriert: keine Anfragen möglich. */
  unavailable?: boolean;
  /** Datenschutzerklärung der Website */
  privacyUrl?: string;
  /** Vorbelegung aus URL-Parametern, serverseitig geprüft (inkl. Belegung). */
  prefill?: PrefillResult | null;
}

const STEPS = [
  { hash: "termin", title: "Termin", heading: "Wann möchtest du den Raum nutzen?" },
  { hash: "anlass", title: "Anlass", heading: "Worum geht es?" },
  { hash: "kontakt", title: "Kontakt & Anfrage", heading: "Wie erreichen wir dich?" },
] as const;
const DONE_HASH = "bestaetigung";
type FlowStep = StepIndex | 3;

const STORAGE_KEY = "space-anfrage:entwurf:v1";
const SUBMIT_KEY = "space-anfrage:anfrage-schluessel:v1";

/** Ein Schlüssel je Anfrage: wiederholtes Senden (Doppelklick, Netzfehler) wird erkannt. */
function getSubmitKey(): string {
  try {
    const existing = window.sessionStorage.getItem(SUBMIT_KEY);
    if (existing) return existing;
  } catch {}
  const key =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
          (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
        );
  try {
    window.sessionStorage.setItem(SUBMIT_KEY, key);
  } catch {}
  return key;
}
function clearSubmitKey() {
  try {
    window.sessionStorage.removeItem(SUBMIT_KEY);
  } catch {}
}

/** Reihenfolge für "erstes fehlerhaftes Feld fokussieren". */
const FIELD_ORDER: (keyof BookingDraft)[] = [
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "occasion",
  "guests",
  "message",
  "name",
  "email",
  "company",
  "phone",
];

const STEP_OF_FIELD: Partial<Record<keyof BookingDraft, StepIndex>> = {
  startDate: 0,
  endDate: 0,
  startTime: 0,
  endTime: 0,
  occasion: 1,
  guests: 1,
  message: 1,
  overnight: 1,
  name: 2,
  email: 2,
  company: 2,
  phone: 2,
};

function readStoredDraft(): BookingDraft | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BookingDraft>;
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return null;
  }
}

function writeStoredDraft(draft: BookingDraft | null) {
  try {
    if (draft) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Speicher nicht verfügbar (z. B. privater Modus) – Eingaben bleiben im Arbeitsspeicher erhalten.
  }
}

function stepFromHash(): FlowStep | null {
  const h = window.location.hash.replace(/^#/, "");
  const i = STEPS.findIndex((s) => s.hash === h);
  if (i >= 0) return i as StepIndex;
  return null;
}

export function BookingFlow({
  initial,
  embed,
  embedOrigins = [],
}: {
  initial: BookingFlowInitial;
  embed: boolean;
  /** Nur im Einbettungsmodus: erlaubte Origins der einbindenden Seite. */
  embedOrigins?: string[];
}) {
  const [draft, setDraft] = useState<BookingDraft>(EMPTY_DRAFT);
  const [step, setStep] = useState<FlowStep>(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [returnToReview, setReturnToReview] = useState(false);
  const [restored, setRestored] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  /** Meldung zur Vorbelegung (belegt/ungültig) – oben im Schritt "Termin". */
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);
  /** Bestätigter, freier Termin aus der Anfrageleiste – Hinweis im Schritt "Anlass". */
  const [prefillOk, setPrefillOk] = useState<{ start: IsoDate; end: IsoDate } | null>(null);

  const [month, setMonth] = useState<IsoMonth>(initial.initialMonth);
  const [booked, setBooked] = useState<Set<IsoDate>>(() => new Set(initial.bookedDates));
  const [loadedMonths, setLoadedMonths] = useState<Set<IsoMonth>>(() => new Set(initial.loadedMonths));
  const [loadError, setLoadError] = useState(false);
  /** Monate, deren Belegung nicht geprüft werden konnte (Fehler ≠ belegt). */
  const [failedMonths, setFailedMonths] = useState<Set<IsoMonth>>(() => new Set());
  const inFlight = useRef(new Set<IsoMonth>());

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResponse | null>(null);

  const rootRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeadingNext = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const bookedRef = useRef(booked);
  bookedRef.current = booked;
  const stepRef = useRef(step);
  stepRef.current = step;

  const minDate = initial.earliestDate;
  const startedAt = useRef(Date.now());
  // Eingebettet: Zusammenfassung anhand der Scrollposition der Elternseite mitführen
  // (position: sticky greift im höhenangepassten iframe nicht, da es selbst nicht scrollt).
  const viewportRef = useRef<ParentViewport | null>(null);
  const applySticky = useCallback(() => {
    const v = viewportRef.current;
    const root = rootRef.current;
    const aside = root?.querySelector<HTMLElement>("[data-sticky-aside]");
    const inner = aside?.querySelector<HTMLElement>("[data-sticky-inner]");
    if (!v || !aside || !inner) return;
    const GAP = 24;
    const asideRect = aside.getBoundingClientRect();
    const visible = asideRect.width > 0 && getComputedStyle(aside).display !== "none";
    const maxShift = aside.clientHeight - inner.offsetHeight;
    const fitsViewport = inner.offsetHeight <= v.height - v.offset - GAP * 2;
    if (!visible || maxShift <= 0 || !fitsViewport) {
      inner.style.transform = "";
      return;
    }
    const asideTop = asideRect.top + window.scrollY; // Position im iframe-Dokument
    const wantedTop = v.offset + GAP - v.top; // Header-Unterkante + Abstand, umgerechnet ins iframe
    const shift = Math.max(0, Math.min(maxShift, wantedTop - asideTop));
    inner.style.transform = shift > 0 ? `translateY(${Math.round(shift)}px)` : "";
  }, []);
  const onViewport = useCallback(
    (v: ParentViewport) => {
      viewportRef.current = v;
      applySticky();
    },
    [applySticky],
  );
  const bridge = useEmbedBridge(embed, embedOrigins, rootRef, onViewport);

  // -------------------------------------------------------------------------
  // Validierung
  // -------------------------------------------------------------------------

  const validate = useCallback(
    (s: StepIndex, d: BookingDraft = draftRef.current): FieldErrors => {
      const errs = validateStep(s, d);
      if (s === 0 && !errs.startDate && !errs.endDate && d.startDate) {
        const end = d.multiDay && d.endDate ? d.endDate : d.startDate;
        if (d.startDate < minDate) {
          errs.startDate = `Dieser Tag ist nicht mehr anfragbar. Bitte wähle einen Tag ab ${formatDateShort(minDate)}.`;
        } else {
          const conflict = eachDay(d.startDate, end).filter((x) => bookedRef.current.has(x));
          if (conflict.length) {
            errs.startDate =
              conflict.length === 1
                ? `Am ${formatDateShort(conflict[0]!)} ist der Raum belegt. Bitte passe deine Auswahl an.`
                : `An ${conflict.length} Tagen deiner Auswahl ist der Raum belegt. Bitte passe deine Auswahl an.`;
          }
        }
      }
      return errs;
    },
    [minDate],
  );

  const firstInvalidStep = useCallback(
    (d: BookingDraft = draftRef.current): FlowStep => {
      for (const s of [0, 1, 2] as StepIndex[]) {
        if (Object.keys(validate(s, d)).length) return s;
      }
      return 3;
    },
    [validate],
  );

  /** Höchster Schritt, der ohne Fehler davor erreichbar ist. */
  const maxReachable = (d: BookingDraft = draft): StepIndex => {
    const f = firstInvalidStep(d);
    return (f === 3 ? 2 : f) as StepIndex;
  };

  // -------------------------------------------------------------------------
  // Navigation (mit Browser-Zurück über den URL-Hash)
  // -------------------------------------------------------------------------

  const goTo = useCallback((target: FlowStep, mode: "push" | "replace" = "push") => {
    const hash = target === 3 ? DONE_HASH : STEPS[target].hash;
    if (window.location.hash !== `#${hash}`) {
      const url = `${window.location.pathname}${window.location.search}#${hash}`;
      if (mode === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    }
    focusHeadingNext.current = true;
    setErrors({});
    setNotice(null);
    setSubmitError(null);
    setStep(target);
  }, []);

  // Entwurf wiederherstellen; URL-Vorbelegung hat Vorrang vor gespeicherten Eingaben.
  useEffect(() => {
    const stored = readStoredDraft();
    const prefill = initial.prefill;

    if (prefill) {
      const d: BookingDraft = { ...(stored ?? EMPTY_DRAFT) };
      if (prefill.guestsGiven) d.guests = prefill.guests;
      let target: StepIndex = 0;
      if (prefill.startDate && prefill.endDate) {
        d.startDate = prefill.startDate;
        d.multiDay = prefill.endDate !== prefill.startDate;
        d.endDate = d.multiDay ? prefill.endDate : null;
        d.timeInOccasionStep = true;
        target = 1;
        setPrefillOk({ start: prefill.startDate, end: prefill.endDate });
        setMonth(monthOf(prefill.startDate));
      } else if (prefill.dateIssue) {
        d.startDate = null;
        d.endDate = null;
        d.multiDay = prefill.requestedMultiDay;
        d.timeInOccasionStep = false;
        setPrefillNotice(prefill.message);
        setAnnouncement(prefill.message ?? "");
      }
      setDraft(d);
      draftRef.current = d;
      setStep(target);
      if (target === 1 && prefill.guestsIssue) setErrors({ guests: GUESTS_PREFILL_ERROR });
      else if (target === 0 && prefill.guestsIssue && !prefill.dateIssue) setPrefillNotice(GUESTS_PREFILL_ERROR);
      window.history.replaceState(null, "", `#${STEPS[target].hash}`);
      setRestored(true);
      return;
    }

    // Regulärer Einstieg: Uhrzeit wieder im Schritt "Termin".
    const d: BookingDraft = stored ? { ...stored, timeInOccasionStep: false } : EMPTY_DRAFT;
    if (stored) {
      setDraft(d);
      draftRef.current = d;
      if (d.startDate && monthOf(d.startDate) >= monthOf(minDate)) setMonth(monthOf(d.startDate));
    }
    const fromHash = stepFromHash();
    if (fromHash !== null && fromHash !== 0) {
      const allowed = Math.min(fromHash, maxReachable(d)) as StepIndex;
      setStep(allowed);
      window.history.replaceState(null, "", `#${STEPS[allowed].hash}`);
    } else if (window.location.hash !== `#${STEPS[0].hash}`) {
      window.history.replaceState(null, "", `#${STEPS[0].hash}`);
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (restored && stepRef.current !== 3) writeStoredDraft(draft);
  }, [draft, restored]);

  useEffect(() => {
    function onPop() {
      if (stepRef.current === 3) {
        // Nach dem Absenden nicht in das ausgefüllte Formular zurückspringen.
        window.history.replaceState(null, "", `#${DONE_HASH}`);
        return;
      }
      const target = stepFromHash() ?? 0;
      const allowed = Math.min(target, maxReachable(draftRef.current)) as StepIndex;
      if (allowed !== target) window.history.replaceState(null, "", `#${STEPS[allowed].hash}`);
      focusHeadingNext.current = true;
      setErrors({});
      setNotice(null);
      setReturnToReview(false);
      setStep(allowed);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fokus auf Überschrift nach Schrittwechsel; Formularanfang sichtbar machen.
  useEffect(() => {
    if (!focusHeadingNext.current) return;
    focusHeadingNext.current = false;
    const root = rootRef.current;
    if (embed) {
      bridge.reportHeight(true);
      bridge.requestScrollTop();
    } else if (root && root.getBoundingClientRect().top < 0) {
      root.scrollIntoView({ block: "start" });
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [step, embed]);

  useEffect(() => {
    if (!embed) return;
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => applySticky());
    ro.observe(root);
    window.addEventListener("resize", applySticky);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", applySticky);
    };
  }, [embed, applySticky]);
  useEffect(() => {
    if (embed) requestAnimationFrame(applySticky);
  }, [embed, step, applySticky]);

  // Einbettungsmodus: Höhe nach Fehlermeldungen und Hinweisen sofort melden
  // (Größenänderungen erfasst zusätzlich ein ResizeObserver).
  useEffect(() => {
    if (!embed) return;
    const id = requestAnimationFrame(() => bridge.reportHeight());
    return () => cancelAnimationFrame(id);
  }, [embed, errors, notice, submitError, submitting, loadError, bridge.reportHeight]);

  // -------------------------------------------------------------------------
  // Verfügbarkeit
  // -------------------------------------------------------------------------

  const loadMonths = useCallback(async (from: IsoMonth, to: IsoMonth) => {
    const months = from === to ? [from] : [from, to];
    if (months.every((m) => inFlight.current.has(m))) return;
    months.forEach((m) => inFlight.current.add(m));
    setLoadError(false);
    try {
      const res = await fetch(`/api/availability?from=${from}&to=${to}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as AvailabilityResponse;
      setBooked((prev) => {
        const next = new Set(prev);
        for (const m of months) for (const d of prev) if (monthOf(d) === m) next.delete(d);
        data.bookedDates.forEach((d) => next.add(d));
        return next;
      });
      setLoadedMonths((prev) => new Set([...prev, ...months]));
      setFailedMonths((prev) => {
        if (!months.some((m) => prev.has(m))) return prev;
        const next = new Set(prev);
        months.forEach((m) => next.delete(m));
        return next;
      });
    } catch {
      setLoadError(true);
      setFailedMonths((prev) => new Set([...prev, ...months]));
    } finally {
      months.forEach((m) => inFlight.current.delete(m));
    }
  }, []);

  useEffect(() => {
    const next = addMonths(month, 1);
    const missing = [month, next].filter((m) => !loadedMonths.has(m));
    if (missing.length) void loadMonths(missing[0]!, missing.at(-1)!);
  }, [month, loadedMonths, loadMonths]);

  // -------------------------------------------------------------------------
  // Eingaben
  // -------------------------------------------------------------------------

  const update = useCallback((patch: Partial<BookingDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors((e) => {
      const keys = Object.keys(patch) as (keyof BookingDraft)[];
      if (!keys.some((k) => e[k])) return e;
      const next = { ...e };
      keys.forEach((k) => delete next[k]);
      if (keys.includes("startDate") || keys.includes("endDate")) {
        delete next.startDate;
        delete next.endDate;
      }
      return next;
    });
  }, []);

  function onDayClick(date: IsoDate) {
    setSubmitError(null);
    setPrefillNotice(null);
    if (date < minDate) {
      setNotice(`Dieser Tag ist nicht anfragbar. Anfragen sind ab ${formatDateShort(minDate)} möglich.`);
      return;
    }
    if (failedMonths.has(monthOf(date)) && !loadedMonths.has(monthOf(date))) {
      setNotice("Die Belegung für diesen Monat konnte gerade nicht geprüft werden. Bitte versuche es erneut.");
      return;
    }
    if (!loadedMonths.has(monthOf(date))) {
      setNotice("Die Belegung für diesen Monat wird noch geladen. Bitte versuche es gleich noch einmal.");
      return;
    }
    if (booked.has(date)) {
      setNotice(`Am ${formatDateShort(date)} ist der Raum bereits belegt. Bitte wähle einen anderen Tag.`);
      return;
    }
    setNotice(null);
    if (!draft.multiDay) {
      update({ startDate: date, endDate: null });
      return;
    }
    const { startDate, endDate } = draft;
    if (!startDate || endDate) {
      update({ startDate: date, endDate: null });
      return;
    }
    if (date === startDate) {
      setNotice("Wähle jetzt einen späteren Tag als letzten Tag. Für nur einen Tag wechsle oben zu „Ein Tag“.");
      return;
    }
    if (date < startDate) {
      update({ startDate: date, endDate: null });
      return;
    }
    const days = eachDay(startDate, date);
    if (days.some((d) => failedMonths.has(monthOf(d)) && !loadedMonths.has(monthOf(d)))) {
      setNotice("Die Belegung für diesen Zeitraum konnte gerade nicht geprüft werden. Bitte versuche es erneut.");
      return;
    }
    if (days.some((d) => !loadedMonths.has(monthOf(d)))) {
      setNotice("Die Belegung für diesen Zeitraum wird noch geladen. Bitte versuche es gleich noch einmal.");
      return;
    }
    const conflict = days.find((d) => booked.has(d));
    if (conflict) {
      setNotice(
        `Am ${formatDateShort(conflict)} ist der Raum belegt. Ein Zeitraum muss durchgehend frei sein – wähle einen früheren letzten Tag oder einen neuen ersten Tag.`,
      );
      return;
    }
    update({ endDate: date });
  }

  function onModeChange(multiDay: boolean) {
    setNotice(null);
    setPrefillNotice(null);
    update({ multiDay, endDate: null });
  }

  function focusFirstError(errs: FieldErrors) {
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (!first) return;
    requestAnimationFrame(() => {
      if (first === "startDate" || first === "endDate") {
        rootRef.current?.querySelector<HTMLButtonElement>('[role="grid"] button[tabindex="0"]')?.focus();
        return;
      }
      document.getElementById(fieldId(first))?.focus();
    });
  }

  function showErrors(errs: FieldErrors) {
    setErrors(errs);
    const n = Object.keys(errs).length;
    setAnnouncement(
      n === 1 ? "Bitte prüfe die markierte Angabe." : `Bitte prüfe die ${n} markierten Angaben.`,
    );
    focusFirstError(errs);
  }

  function next() {
    if (step === 3) return;
    const errs = validate(step);
    if (Object.keys(errs).length) {
      showErrors(errs);
      return;
    }
    setAnnouncement("");
    if (returnToReview && step < 2) {
      setReturnToReview(false);
      const f = firstInvalidStep();
      goTo(f === 3 ? 2 : (Math.min(f, 2) as StepIndex));
      return;
    }
    goTo((step + 1) as FlowStep);
  }

  function back() {
    if (step === 0 || step === 3) return;
    goTo((step - 1) as StepIndex);
  }

  function editFromReview(target: StepIndex) {
    setReturnToReview(true);
    goTo(target);
  }

  async function submit() {
    const errs = validate(2);
    if (Object.keys(errs).length) {
      showErrors(errs);
      return;
    }
    const f = firstInvalidStep();
    if (f !== 3) {
      goTo(f);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/anfrage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draftToRequest(draft), website: honeypot, idempotencyKey: getSubmitKey(), startedAt: startedAt.current }),
      });
      const data = (await res.json().catch(() => null)) as SubmitResponse | SubmitErrorResponse | null;
      if (res.ok && data?.ok) {
        setResult(data);
        writeStoredDraft(null);
        clearSubmitKey();
        goTo(3, "replace");
        return;
      }
      const err = data && !data.ok ? data : null;
      if (res.status === 409 && err?.conflictDates?.length) {
        setBooked((prev) => new Set([...prev, ...err.conflictDates!]));
        goTo(0);
        setTimeout(() => setErrors({ startDate: err.error }), 0);
        return;
      }
      if (err?.fieldErrors) {
        const fe = err.fieldErrors as FieldErrors;
        const steps = Object.keys(fe)
          .map((k) =>
            (k === "startTime" || k === "endTime") && draft.timeInOccasionStep
              ? 1
              : STEP_OF_FIELD[k as keyof BookingDraft],
          )
          .filter((s): s is StepIndex => s !== undefined);
        const target = steps.length ? (Math.min(...steps) as StepIndex) : 2;
        if (target !== 2) goTo(target);
        setTimeout(() => showErrors(fe), 0);
      }
      setSubmitError(err?.error ?? "Deine Anfrage konnte gerade nicht übermittelt werden. Bitte versuche es erneut.");
    } catch {
      setSubmitError("Keine Verbindung. Bitte prüfe deine Internetverbindung und versuche es erneut.");
    } finally {
      setSubmitting(false);
    }
  }

  function restart() {
    setDraft(EMPTY_DRAFT);
    setPrefillOk(null);
    setPrefillNotice(null);
    setResult(null);
    setHoneypot("");
    setReturnToReview(false);
    writeStoredDraft(null);
    clearSubmitKey();
    setMonth(monthOf(minDate));
    goTo(0, "replace");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (step === 2) void submit();
    else next();
  }

  // -------------------------------------------------------------------------
  // Darstellung
  // -------------------------------------------------------------------------

  const reachable = maxReachable();
  const current = step === 3 ? null : STEPS[step];

  return (
    <main ref={rootRef} id="anfrage" className={styles.main} data-embed={embed || undefined}>
      {embed ? (
        <h1 className="visually-hidden">{VENUE.name} unverbindlich anfragen</h1>
      ) : (
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Unverbindliche Anfrage</p>
        <h1 className={styles.title}>{VENUE.name} anfragen</h1>
        <p className={styles.lead}>
          {VENUE.areaSqm} m² {VENUE.feature} in {VENUE.location}. Sag uns, wann und wofür du den Raum brauchst – wir
          melden uns mit einer Rückmeldung zu deinem Termin.
        </p>
      </div>
      )}

      {initial.demo ? (
        <p className={styles.demoBanner}>
          <strong>Demomodus.</strong> Belegte Tage sind Beispieldaten. Es wird nichts versendet und nichts reserviert.
        </p>
      ) : null}

      <div className={styles.layout} data-done={step === 3 || undefined}>
        <div className={styles.formCol}>
          {initial.unavailable ? (
            <p className={styles.prefillNotice} role="alert">
              Online-Anfragen sind gerade nicht möglich. Bitte schreib uns direkt an{" "}
              <a href="mailto:stay@unique-places.com">stay@unique-places.com</a>.
            </p>
          ) : initial.prefill && !restored ? (
            <p className={styles.checking} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              Dein Wunschtermin wird geprüft …
            </p>
          ) : current ? (
            <>
              <SummaryCompact draft={draft} />

              <nav aria-label="Fortschritt" className={styles.stepper}>
                <ol>
                  {STEPS.map((s, i) => {
                    const isCurrent = i === step;
                    const isDone = i < step;
                    const canJump = !isCurrent && i <= reachable;
                    const state = isCurrent ? "current" : isDone ? "done" : "upcoming";
                    const statusText = isCurrent ? "aktueller Schritt" : isDone ? "erledigt, bearbeiten" : "noch offen";
                    const inner = (
                      <>
                        <span className={styles.stepNum} aria-hidden="true">
                          {isDone ? <CheckIcon /> : i + 1}
                        </span>
                        <span className={styles.stepName}>
                          {s.title}
                          <span className="visually-hidden">
                            {" "}
                            (Schritt {i + 1} von {STEPS.length}, {statusText})
                          </span>
                        </span>
                      </>
                    );
                    return (
                      <li key={s.hash} data-state={state}>
                        {canJump ? (
                          <button type="button" onClick={() => goTo(i as StepIndex)}>
                            {inner}
                          </button>
                        ) : (
                          <span aria-current={isCurrent ? "step" : undefined}>{inner}</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </nav>

              <form className={styles.form} noValidate onSubmit={onSubmit} aria-labelledby="step-title">
                <p className={styles.stepCount}>
                  Schritt {step + 1} von {STEPS.length}
                </p>
                <h2 id="step-title" ref={headingRef} tabIndex={-1} className={styles.stepTitle}>
                  {current.heading}
                </h2>

                <div className={styles.stepBody}>
                  {step === 0 && prefillNotice ? (
                    <p className={styles.prefillNotice} role="alert">
                      {prefillNotice}
                    </p>
                  ) : null}
                  {step === 1 &&
                  prefillOk &&
                  draft.startDate === prefillOk.start &&
                  (draft.endDate ?? draft.startDate) === prefillOk.end ? (
                    <div className={styles.prefillOk}>
                      <p>
                        <span className={styles.okMark} aria-hidden="true">
                          ✓
                        </span>
                        <span>
                          <strong>{formatRange(prefillOk.start, prefillOk.end === prefillOk.start ? null : prefillOk.end)}</strong>{" "}
                          ist laut Kalender{initial.demo ? " (Beispieldaten)" : ""} frei. Erst unsere Bestätigung reserviert den
                          Termin.
                        </span>
                      </p>
                      <button type="button" className={styles.linkButton} onClick={() => goTo(0)}>
                        Termin ändern
                      </button>
                    </div>
                  ) : null}
                  {step === 0 ? (
                    <StepDate
                      draft={draft}
                      update={update}
                      errors={errors}
                      notice={notice}
                      month={month}
                      onMonthChange={setMonth}
                      today={initial.today}
                      minDate={minDate}
                      booked={booked}
                      loadedMonths={loadedMonths}
                      loadError={loadError}
                      failedMonths={failedMonths}
                      onRetry={() => void loadMonths(month, addMonths(month, 1))}
                      onDayClick={onDayClick}
                      onModeChange={onModeChange}
                    />
                  ) : step === 1 ? (
                    <StepOccasion draft={draft} update={update} errors={errors} />
                  ) : (
                    <StepContact
                      draft={draft}
                      update={update}
                      errors={errors}
                      onEdit={editFromReview}
                      honeypot={honeypot}
                      setHoneypot={setHoneypot}
                    />
                  )}
                </div>

                {step === 2 ? (
                  <p className={styles.privacy}>
                    Wir verwenden deine Angaben ausschließlich, um deine Anfrage zu bearbeiten und dir zu antworten. Mehr
                    dazu in unserer{" "}
                    <a href={initial.privacyUrl ?? "https://unique-places.com/datenschutz"} target="_blank" rel="noopener noreferrer">
                      Datenschutzerklärung
                    </a>
                    .
                  </p>
                ) : null}

                {step === 2 && initial.demo ? (
                  <p className={styles.demoInline}>
                    Demomodus: Beim Absenden wird nichts versendet, gespeichert oder reserviert. Du siehst anschließend
                    eine beispielhafte Bestätigung.
                  </p>
                ) : null}

                {submitError ? (
                  <p className={styles.formError} role="alert">
                    {submitError}
                  </p>
                ) : null}

                <div className={styles.actions}>
                  <button type="submit" className={styles.primary} disabled={submitting} aria-busy={submitting || undefined}>
                    {step === 2
                      ? submitting
                        ? "Wird gesendet …"
                        : "Unverbindlich anfragen"
                      : returnToReview
                        ? "Übernehmen und zur Übersicht"
                        : "Weiter"}
                  </button>
                  {step > 0 ? (
                    <button type="button" className={styles.secondary} onClick={back}>
                      Zurück
                    </button>
                  ) : null}
                </div>
              </form>
            </>
          ) : result ? (
            <Confirmation ref={headingRef} draft={draft} result={result} onRestart={restart} />
          ) : null}
        </div>

        {current && !(initial.prefill && !restored) ? <SummaryAside draft={draft} /> : null}
      </div>

      <div className="visually-hidden" aria-live="assertive" role="status">
        {announcement}
      </div>
    </main>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <path d="M3 7.2 5.8 10 11 4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
