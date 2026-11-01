"use client";

import { MAX_MONTHS_AHEAD, type BookingDraft, type FieldErrors } from "@/lib/booking";
import { addMonths, daysInclusive, formatDateLong, formatRange, monthOf, type IsoDate, type IsoMonth } from "@/lib/dates";
import { Calendar } from "./Calendar";
import { TimeFields } from "./TimeFields";
import { FieldError } from "./fields";
import styles from "./booking.module.css";

interface Props {
  draft: BookingDraft;
  update: (patch: Partial<BookingDraft>) => void;
  errors: FieldErrors;
  notice: string | null;
  month: IsoMonth;
  onMonthChange: (m: IsoMonth) => void;
  today: IsoDate;
  minDate: IsoDate;
  booked: ReadonlySet<IsoDate>;
  loadedMonths: ReadonlySet<IsoMonth>;
  loadError: boolean;
  failedMonths: ReadonlySet<IsoMonth>;
  onRetry: () => void;
  onDayClick: (date: IsoDate) => void;
  onModeChange: (multiDay: boolean) => void;
}

export function StepDate(p: Props) {
  const { draft, update, errors } = p;
  const dateError = errors.startDate ?? errors.endDate;
  const end = draft.multiDay ? draft.endDate : null;

  let selection: string;
  if (!draft.startDate) {
    selection = draft.multiDay ? "Wähle den ersten Tag." : "Noch kein Tag gewählt.";
  } else if (draft.multiDay && !end) {
    selection = `Erster Tag: ${formatDateLong(draft.startDate)}. Wähle jetzt den letzten Tag.`;
  } else if (end && end !== draft.startDate) {
    selection = `${formatRange(draft.startDate, end)} · ${daysInclusive(draft.startDate, end)} Tage`;
  } else {
    selection = formatDateLong(draft.startDate);
  }

  return (
    <>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legendTitle}>Wie lange braucht ihr den Raum?</legend>
        <div className={styles.segmented}>
          <label>
            <input
              type="radio"
              name="multiDay"
              checked={!draft.multiDay}
              onChange={() => p.onModeChange(false)}
            />
            <span>Ein Tag</span>
          </label>
          <label>
            <input
              type="radio"
              name="multiDay"
              checked={draft.multiDay}
              onChange={() => p.onModeChange(true)}
            />
            <span>Mehrere Tage</span>
          </label>
        </div>
      </fieldset>

      <div className={styles.field} data-invalid={!!dateError || undefined}>
        <p className={styles.label} id="cal-label">
          {draft.multiDay ? "Erster und letzter Tag" : "Wunschtag"}
        </p>
        <p className={styles.hint} id="cal-hint">
          {draft.multiDay
            ? "Wähle zuerst den ersten, dann den letzten Tag. Der Zeitraum muss durchgehend frei sein."
            : "Wähle einen freien Tag. Mit den Pfeiltasten kannst du dich im Kalender bewegen."}
        </p>
        <Calendar
          month={p.month}
          onMonthChange={p.onMonthChange}
          minDate={p.minDate}
          maxMonth={addMonths(monthOf(p.today), MAX_MONTHS_AHEAD)}
          today={p.today}
          booked={p.booked}
          loadedMonths={p.loadedMonths}
          loadError={p.loadError}
          failedMonths={p.failedMonths}
          onRetry={p.onRetry}
          start={draft.startDate}
          end={end}
          multiDay={draft.multiDay}
          onDayClick={p.onDayClick}
          describedBy={["cal-hint", "cal-selection", dateError ? "f-startDate-error" : null].filter(Boolean).join(" ")}
          invalid={!!dateError}
        />
        {/* Feste Höhe: Der Link ist immer im Layout (ohne Auswahl unsichtbar), damit
            das Formular beim Wählen eines Tages nicht springt. */}
        <div className={styles.selectionRow} data-multi={draft.multiDay || undefined}>
          <p id="cal-selection" className={styles.selection} aria-live="polite">
            {selection}
          </p>
          <button
            type="button"
            className={styles.linkButton}
            data-hidden={!draft.startDate || undefined}
            aria-hidden={!draft.startDate || undefined}
            tabIndex={draft.startDate ? undefined : -1}
            disabled={!draft.startDate}
            onClick={() => update({ startDate: null, endDate: null })}
          >
            Auswahl zurücksetzen
          </button>
        </div>
        {p.notice ? (
          <p className={styles.notice} role="status">
            {p.notice}
          </p>
        ) : null}
        <FieldError name="startDate" error={dateError} />
      </div>

      {draft.timeInOccasionStep ? null : <TimeFields draft={draft} update={update} errors={errors} />}

      <p className={styles.callout}>
        Deine Anfrage ist unverbindlich. Erst unsere Bestätigung reserviert den Termin für dich.
      </p>
    </>
  );
}
