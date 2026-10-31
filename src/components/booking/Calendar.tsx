"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  addDays,
  addMonths,
  formatDateLong,
  formatMonth,
  monthGrid,
  monthOf,
  weekdayMondayFirst,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  type IsoDate,
  type IsoMonth,
} from "@/lib/dates";
import styles from "./booking.module.css";

export interface CalendarProps {
  month: IsoMonth;
  onMonthChange: (month: IsoMonth) => void;
  minDate: IsoDate;
  maxMonth: IsoMonth;
  today: IsoDate;
  booked: ReadonlySet<IsoDate>;
  loadedMonths: ReadonlySet<IsoMonth>;
  loadError: boolean;
  onRetry: () => void;
  start: IsoDate | null;
  end: IsoDate | null;
  multiDay: boolean;
  onDayClick: (date: IsoDate) => void;
  describedBy?: string;
  invalid?: boolean;
}

type DayState = "available" | "booked" | "past" | "unknown";

export function Calendar(props: CalendarProps) {
  const {
    month,
    onMonthChange,
    minDate,
    maxMonth,
    today,
    booked,
    loadedMonths,
    loadError,
    onRetry,
    start,
    end,
    multiDay,
    onDayClick,
    describedBy,
    invalid,
  } = props;

  const labelId = useId();
  const gridRef = useRef<HTMLTableElement>(null);
  const [focusDate, setFocusDate] = useState<IsoDate>(() => start ?? (monthOf(minDate) === month ? minDate : `${month}-01`));
  const [hoverDate, setHoverDate] = useState<IsoDate | null>(null);
  const shouldFocus = useRef(false);

  // Fokus-Tag bleibt im angezeigten Monat.
  useEffect(() => {
    if (monthOf(focusDate) !== month) {
      setFocusDate(start && monthOf(start) === month ? start : monthOf(minDate) === month ? minDate : `${month}-01`);
    }
  }, [month, focusDate, start, minDate]);

  useEffect(() => {
    if (shouldFocus.current) {
      shouldFocus.current = false;
      gridRef.current?.querySelector<HTMLButtonElement>(`button[data-date="${focusDate}"]`)?.focus();
    }
  }, [focusDate, month]);

  const loaded = loadedMonths.has(month);
  const minMonth = monthOf(minDate);
  const canPrev = month > minMonth;
  const canNext = month < maxMonth;

  function stateOf(date: IsoDate): DayState {
    if (date < minDate) return "past";
    if (!loadedMonths.has(monthOf(date))) return "unknown";
    if (booked.has(date)) return "booked";
    return "available";
  }

  // Vorschau eines Zeitraums beim Überfahren/Fokussieren im Mehrtagesmodus.
  const previewEnd = multiDay && start && !end && hoverDate && hoverDate > start ? hoverDate : null;
  const rangeEnd = end ?? previewEnd;

  function moveFocus(target: IsoDate) {
    if (target < `${minMonth}-01`) return;
    if (monthOf(target) > maxMonth) return;
    shouldFocus.current = true;
    setFocusDate(target);
    if (monthOf(target) !== month) onMonthChange(monthOf(target));
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, date: IsoDate) {
    let target: IsoDate | null = null;
    switch (e.key) {
      case "ArrowLeft":
        target = addDays(date, -1);
        break;
      case "ArrowRight":
        target = addDays(date, 1);
        break;
      case "ArrowUp":
        target = addDays(date, -7);
        break;
      case "ArrowDown":
        target = addDays(date, 7);
        break;
      case "Home":
        target = addDays(date, -weekdayMondayFirst(date));
        break;
      case "End":
        target = addDays(date, 6 - weekdayMondayFirst(date));
        break;
      case "PageUp":
      case "PageDown": {
        const m = addMonths(monthOf(date), e.key === "PageUp" ? -1 : 1);
        const day = Math.min(Number(date.slice(8)), 28);
        target = `${m}-${String(day).padStart(2, "0")}`;
        break;
      }
      default:
        return;
    }
    e.preventDefault();
    moveFocus(target);
  }

  const weeks = monthGrid(month);

  return (
    <div className={styles.calendar} data-invalid={invalid || undefined}>
      <div className={styles.calHeader}>
        <button
          type="button"
          className={styles.calNav}
          onClick={() => onMonthChange(addMonths(month, -1))}
          disabled={!canPrev}
          aria-label="Vorheriger Monat"
        >
          <Chevron dir="left" />
        </button>
        <h3 id={labelId} className={styles.calTitle} aria-live="polite">
          {formatMonth(month)}
        </h3>
        <button
          type="button"
          className={styles.calNav}
          onClick={() => onMonthChange(addMonths(month, 1))}
          disabled={!canNext}
          aria-label="Nächster Monat"
        >
          <Chevron dir="right" />
        </button>
      </div>

      <table
        ref={gridRef}
        className={styles.calGrid}
        role="grid"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-busy={!loaded && !loadError}
        onMouseLeave={() => setHoverDate(null)}
      >
        <thead>
          <tr>
            {WEEKDAY_SHORT.map((d, i) => (
              <th key={d} scope="col" abbr={WEEKDAY_LONG[i]}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((date, di) => {
                if (!date) return <td key={di} role="gridcell" aria-hidden="true" />;
                const st = stateOf(date);
                const selectable = st === "available";
                const isStart = date === start;
                const isEnd = !!rangeEnd && date === rangeEnd;
                const inRange = !!start && !!rangeEnd && date > start && date < rangeEnd;
                const selected = isStart || (!!end && (date === end || inRange));
                const isToday = date === today;
                const parts = [formatDateLong(date)];
                if (isToday) parts.push("heute");
                if (st === "booked") parts.push("belegt");
                if (st === "past") parts.push("nicht wählbar");
                if (st === "unknown") parts.push("Belegung wird geladen");
                if (isStart && multiDay) parts.push("erster Tag");
                if (end && date === end && end !== start) parts.push("letzter Tag");
                if (selected && !multiDay) parts.push("ausgewählt");
                return (
                  <td key={di} role="gridcell" aria-selected={selected}>
                    <button
                      type="button"
                      data-date={date}
                      tabIndex={date === focusDate ? 0 : -1}
                      aria-disabled={!selectable || undefined}
                      aria-label={parts.join(", ")}
                      className={styles.day}
                      data-state={st}
                      data-start={isStart || undefined}
                      data-end={isEnd || undefined}
                      data-in-range={inRange || undefined}
                      data-preview={(!end && (inRange || isEnd)) || undefined}
                      data-today={isToday || undefined}
                      onClick={() => {
                        setFocusDate(date);
                        onDayClick(date);
                      }}
                      onKeyDown={(e) => onKeyDown(e, date)}
                      onMouseEnter={() => setHoverDate(date)}
                      onFocus={() => {
                        setFocusDate(date);
                        setHoverDate(date);
                      }}
                    >
                      <span aria-hidden="true">{Number(date.slice(8))}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.calFooter}>
        <ul className={styles.legend} aria-label="Legende">
          <li>
            <span className={styles.legendSwatch} data-kind="selected" aria-hidden="true" />
            Deine Auswahl
          </li>
          <li>
            <span className={styles.legendSwatch} data-kind="booked" aria-hidden="true" />
            Belegt
          </li>
        </ul>
        {loadError ? (
          <p className={styles.calStatus} role="alert">
            Die Belegung konnte nicht geladen werden.{" "}
            <button type="button" className={styles.linkButton} onClick={onRetry}>
              Erneut versuchen
            </button>
          </p>
        ) : !loaded ? (
          <p className={styles.calStatus} role="status">
            Belegung wird geladen …
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        d={dir === "left" ? "M11 3.5 5.5 9l5.5 5.5" : "M7 3.5 12.5 9 7 14.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}
