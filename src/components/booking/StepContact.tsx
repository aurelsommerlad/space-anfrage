"use client";

import { occasionLabel, type BookingDraft, type FieldErrors, type StepIndex } from "@/lib/booking";
import { describedBy, Field, fieldId } from "./fields";
import { guestsText, termText, timeText } from "./Summary";
import styles from "./booking.module.css";

interface Props {
  draft: BookingDraft;
  update: (patch: Partial<BookingDraft>) => void;
  errors: FieldErrors;
  onEdit: (step: StepIndex) => void;
  honeypot: string;
  setHoneypot: (v: string) => void;
}

export function StepContact({ draft, update, errors, onEdit, honeypot, setHoneypot }: Props) {
  return (
    <>
      <div className={styles.twoCol}>
        <Field name="name" label="Name" error={errors.name}>
          <input
            id={fieldId("name")}
            className={styles.input}
            type="text"
            autoComplete="name"
            required
            aria-required="true"
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            aria-invalid={!!errors.name || undefined}
            aria-describedby={describedBy("name", false, errors.name)}
          />
        </Field>
        <Field name="email" label="E-Mail" error={errors.email}>
          <input
            id={fieldId("email")}
            className={styles.input}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-required="true"
            value={draft.email}
            onChange={(e) => update({ email: e.target.value })}
            aria-invalid={!!errors.email || undefined}
            aria-describedby={describedBy("email", false, errors.email)}
          />
        </Field>
        <Field name="company" label="Unternehmen" optional error={errors.company}>
          <input
            id={fieldId("company")}
            className={styles.input}
            type="text"
            autoComplete="organization"
            value={draft.company}
            onChange={(e) => update({ company: e.target.value })}
            aria-invalid={!!errors.company || undefined}
            aria-describedby={describedBy("company", false, errors.company)}
          />
        </Field>
        <Field name="phone" label="Telefon" optional error={errors.phone}>
          <input
            id={fieldId("phone")}
            className={styles.input}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={draft.phone}
            onChange={(e) => update({ phone: e.target.value })}
            aria-invalid={!!errors.phone || undefined}
            aria-describedby={describedBy("phone", false, errors.phone)}
          />
        </Field>
      </div>

      {/* Honeypot: für Menschen unsichtbar, für Screenreader ausgeblendet. */}
      <div className={styles.hp} aria-hidden="true">
        <label htmlFor="f-website">Website</label>
        <input
          id="f-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <section className={styles.review} aria-labelledby="review-title">
        <h3 id="review-title" className={styles.reviewTitle}>
          Deine Angaben im Überblick
        </h3>

        <ReviewGroup title="Termin" onEdit={() => onEdit(0)}>
          <ReviewRow label="Datum" value={termText(draft)} />
          <ReviewRow label="Uhrzeit" value={timeText(draft)} />
        </ReviewGroup>

        <ReviewGroup title="Anlass" onEdit={() => onEdit(1)}>
          <ReviewRow label="Anlass" value={occasionLabel(draft.occasion)} />
          <ReviewRow label="Personen" value={guestsText(draft)} />
          <ReviewRow label="Wünsche" value={draft.message.trim() || "Keine Angabe"} multiline />
          <ReviewRow label="Übernachtung im HØV" value={draft.overnight ? "Gewünscht" : "Nicht gewünscht"} />
        </ReviewGroup>
      </section>
    </>
  );
}

function ReviewGroup({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className={styles.reviewGroup}>
      <div className={styles.reviewHead}>
        <h4>{title}</h4>
        <button type="button" className={styles.linkButton} onClick={onEdit} aria-label={`${title} ändern`}>
          Ändern
        </button>
      </div>
      <dl className={styles.reviewList}>{children}</dl>
    </div>
  );
}

function ReviewRow({ label, value, multiline }: { label: string; value: string | null; multiline?: boolean }) {
  return (
    <div className={styles.reviewRow}>
      <dt>{label}</dt>
      <dd data-multiline={multiline || undefined}>{value || "–"}</dd>
    </div>
  );
}
