"use client";

import { occasionLabel, VENUE, type BookingDraft } from "@/lib/booking";
import { daysInclusive, formatRange } from "@/lib/dates";
import styles from "./booking.module.css";

export function termText(d: BookingDraft): string | null {
  if (!d.startDate) return null;
  const end = d.multiDay ? d.endDate : null;
  if (d.multiDay && !end) return `ab ${formatRange(d.startDate, null)}`;
  return formatRange(d.startDate, end);
}

export function timeText(d: BookingDraft): string | null {
  if (!d.startTime && !d.endTime) return null;
  const range = `${d.startTime || "–"} bis ${d.endTime || "–"} Uhr`;
  return d.multiDay ? `${range} (Beginn am ersten, Ende am letzten Tag)` : range;
}

export function guestsText(d: BookingDraft): string | null {
  if (!d.guests || !/^\d+$/.test(d.guests)) return null;
  const n = Number(d.guests);
  return `${n} ${n === 1 ? "Person" : "Personen"}`;
}

function SummaryList({ draft }: { draft: BookingDraft }) {
  const term = termText(draft);
  const days = draft.startDate && draft.multiDay && draft.endDate ? daysInclusive(draft.startDate, draft.endDate) : null;
  const rows: [string, string | null][] = [
    ["Termin", term ? (days && days > 1 ? `${term} · ${days} Tage` : term) : null],
    ["Uhrzeit", timeText(draft)],
    ["Anlass", occasionLabel(draft.occasion) || null],
    ["Personen", guestsText(draft)],
    ["Übernachtung", draft.overnight ? "Gewünscht" : null],
  ];
  return (
    <dl className={styles.summaryList}>
      {rows.map(([k, v]) => (
        <div key={k} className={styles.summaryRow}>
          <dt>{k}</dt>
          <dd data-empty={!v || undefined}>{v ?? "Noch offen"}</dd>
        </div>
      ))}
    </dl>
  );
}

function VenueLine() {
  return (
    <p className={styles.venueLine}>
      {VENUE.areaSqm} m² · {VENUE.feature} · {VENUE.location}
    </p>
  );
}

/** Schmale Zusammenfassung rechts (Desktop). */
export function SummaryAside({ draft }: { draft: BookingDraft }) {
  return (
    <aside className={styles.summaryAside} aria-labelledby="summary-title" data-sticky-aside>
      <div className={styles.summarySticky} data-sticky-inner>
        <p className={styles.eyebrow} id="summary-title">
          Deine Anfrage
        </p>
        <h2 className={styles.summaryVenue}>{VENUE.name}</h2>
        <VenueLine />
        <SummaryList draft={draft} />
        <p className={styles.summaryNote}>Unverbindlich. Erst unsere Bestätigung reserviert den Termin.</p>
      </div>
    </aside>
  );
}

/** Kompakte, aufklappbare Zusammenfassung (Mobil). */
export function SummaryCompact({ draft }: { draft: BookingDraft }) {
  const term = termText(draft);
  const guests = guestsText(draft);
  const line = [term, guests].filter(Boolean).join(" · ") || "Noch kein Termin gewählt";
  return (
    <details className={styles.summaryCompact}>
      <summary>
        <span className={styles.summaryCompactLabel}>Deine Anfrage</span>
        <span className={styles.summaryCompactLine}>{line}</span>
      </summary>
      <div className={styles.summaryCompactBody}>
        <p className={styles.summaryVenueSmall}>{VENUE.name}</p>
        <VenueLine />
        <SummaryList draft={draft} />
      </div>
    </details>
  );
}
