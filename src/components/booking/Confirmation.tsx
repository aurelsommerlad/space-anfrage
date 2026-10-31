"use client";

import { forwardRef } from "react";
import { occasionLabel, VENUE, type BookingDraft } from "@/lib/booking";
import type { SubmitResponse } from "@/lib/availability";
import { guestsText, termText, timeText } from "./Summary";
import styles from "./booking.module.css";

interface Props {
  draft: BookingDraft;
  result: SubmitResponse;
  onRestart: () => void;
}

export const Confirmation = forwardRef<HTMLHeadingElement, Props>(function Confirmation(
  { draft, result, onRestart },
  headingRef,
) {
  const firstName = draft.name.trim().split(/\s+/)[0] ?? "";
  return (
    <section className={styles.confirmation} aria-labelledby="confirm-title">
      {result.demo ? (
        <p className={styles.demoBanner}>
          <strong>Beispielhafte Bestätigung.</strong> Im Demomodus wurde nichts versendet, gespeichert oder reserviert.
        </p>
      ) : null}

      <p className={styles.eyebrow}>Anfrage eingegangen</p>
      <h2 id="confirm-title" ref={headingRef} tabIndex={-1} className={styles.stepTitle}>
        Danke{firstName ? `, ${firstName}` : ""}. Wir haben deine Anfrage erhalten.
      </h2>
      <p className={styles.lead}>
        Wir prüfen deinen Wunschtermin für {VENUE.name} und melden uns per E-Mail an{" "}
        <strong className={styles.breakAll}>{draft.email.trim()}</strong>. Erst mit unserer Bestätigung ist der Termin
        für dich reserviert.
      </p>

      <dl className={styles.reviewList} style={{ marginTop: 40 }}>
        <div className={styles.reviewRow}>
          <dt>Anfragenummer</dt>
          <dd>{result.reference}</dd>
        </div>
        <div className={styles.reviewRow}>
          <dt>Termin</dt>
          <dd>{termText(draft)}</dd>
        </div>
        <div className={styles.reviewRow}>
          <dt>Uhrzeit</dt>
          <dd>{timeText(draft)}</dd>
        </div>
        <div className={styles.reviewRow}>
          <dt>Anlass</dt>
          <dd>
            {occasionLabel(draft.occasion)} · {guestsText(draft)}
          </dd>
        </div>
        {draft.overnight ? (
          <div className={styles.reviewRow}>
            <dt>Übernachtung</dt>
            <dd>Gewünscht</dd>
          </div>
        ) : null}
      </dl>

      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onRestart}>
          Neue Anfrage starten
        </button>
      </div>
    </section>
  );
});
