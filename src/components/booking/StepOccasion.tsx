"use client";

import { MESSAGE_MAX_LENGTH, OCCASIONS, type BookingDraft, type FieldErrors } from "@/lib/booking";
import { describedBy, Field, FieldError, fieldId } from "./fields";
import styles from "./booking.module.css";

interface Props {
  draft: BookingDraft;
  update: (patch: Partial<BookingDraft>) => void;
  errors: FieldErrors;
}

export function StepOccasion({ draft, update, errors }: Props) {
  return (
    <>
      <fieldset
        className={styles.fieldset}
        aria-describedby={errors.occasion ? "f-occasion-error" : undefined}
        aria-invalid={!!errors.occasion || undefined}
        data-invalid={!!errors.occasion || undefined}
      >
        <legend className={styles.legendTitle}>Was habt ihr vor?</legend>
        <div className={styles.options}>
          {OCCASIONS.map((o, i) => (
            <label key={o.id} className={styles.option}>
              <input
                type="radio"
                name="occasion"
                value={o.id}
                id={i === 0 ? fieldId("occasion") : undefined}
                checked={draft.occasion === o.id}
                onChange={() => update({ occasion: o.id })}
              />
              <span className={styles.optionMark} aria-hidden="true" />
              <span className={styles.optionLabel}>{o.label}</span>
            </label>
          ))}
        </div>
        <FieldError name="occasion" error={errors.occasion} />
      </fieldset>

      <Field name="guests" label="Anzahl Personen" error={errors.guests}>
        <input
          id={fieldId("guests")}
          className={`${styles.input} ${styles.inputShort}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={draft.guests}
          onChange={(e) => update({ guests: e.target.value.replace(/[^\d]/g, "").slice(0, 4) })}
          aria-invalid={!!errors.guests || undefined}
          aria-describedby={describedBy("guests", false, errors.guests)}
        />
      </Field>

      <Field
        name="message"
        label="Deine Wünsche"
        optional
        hint={
          draft.occasion === "anderes"
            ? "Erzähl uns kurz, was du planst – und was dir dabei wichtig ist."
            : "Ablauf, Verpflegung, besondere Wünsche – alles, was uns bei der Planung hilft."
        }
        error={errors.message}
      >
        <textarea
          id={fieldId("message")}
          className={styles.textarea}
          rows={5}
          maxLength={MESSAGE_MAX_LENGTH}
          value={draft.message}
          onChange={(e) => update({ message: e.target.value })}
          aria-invalid={!!errors.message || undefined}
          aria-describedby={describedBy("message", true, errors.message)}
        />
        <p className={styles.counter} aria-hidden="true">
          {draft.message.length} / {MESSAGE_MAX_LENGTH}
        </p>
      </Field>

      <label className={styles.checkbox}>
        <input
          type="checkbox"
          id={fieldId("overnight")}
          checked={draft.overnight}
          onChange={(e) => update({ overnight: e.target.checked })}
        />
        <span className={styles.checkboxMark} aria-hidden="true" />
        <span>Wir möchten auch im HØV übernachten</span>
      </label>
    </>
  );
}
