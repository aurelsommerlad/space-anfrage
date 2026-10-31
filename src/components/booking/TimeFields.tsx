"use client";

import { TIME_OPTIONS, type BookingDraft, type FieldErrors } from "@/lib/booking";
import { describedBy, Field, fieldId } from "./fields";
import styles from "./booking.module.css";

interface Props {
  draft: BookingDraft;
  update: (patch: Partial<BookingDraft>) => void;
  errors: FieldErrors;
}

/** Gewünschte Uhrzeit von/bis – im Schritt "Termin" oder (nach Vorbelegung) "Anlass". */
export function TimeFields({ draft, update, errors }: Props) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legendTitle}>Gewünschte Uhrzeit</legend>
      <div className={styles.twoCol}>
        <Field
          name="startTime"
          label={draft.multiDay ? "Von (am ersten Tag)" : "Von"}
          error={errors.startTime}
        >
          <select
            id={fieldId("startTime")}
            className={styles.select}
            value={draft.startTime}
            onChange={(e) => update({ startTime: e.target.value })}
            aria-invalid={!!errors.startTime || undefined}
            aria-describedby={describedBy("startTime", false, errors.startTime)}
          >
            <option value="">Uhrzeit wählen</option>
            {TIME_OPTIONS.filter((t) => t !== "24:00").map((t) => (
              <option key={t} value={t}>
                {t} Uhr
              </option>
            ))}
          </select>
        </Field>
        <Field name="endTime" label={draft.multiDay ? "Bis (am letzten Tag)" : "Bis"} error={errors.endTime}>
          <select
            id={fieldId("endTime")}
            className={styles.select}
            value={draft.endTime}
            onChange={(e) => update({ endTime: e.target.value })}
            aria-invalid={!!errors.endTime || undefined}
            aria-describedby={describedBy("endTime", false, errors.endTime)}
          >
            <option value="">Uhrzeit wählen</option>
            {TIME_OPTIONS.filter((t) => t !== "06:00").map((t) => (
              <option key={t} value={t}>
                {t} Uhr
              </option>
            ))}
          </select>
        </Field>
      </div>
    </fieldset>

  );
}
