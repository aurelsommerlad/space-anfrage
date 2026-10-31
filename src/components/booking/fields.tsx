"use client";

import type { ReactNode } from "react";
import styles from "./booking.module.css";

export function fieldId(name: string) {
  return `f-${name}`;
}
export function errorId(name: string) {
  return `f-${name}-error`;
}
export function hintId(name: string) {
  return `f-${name}-hint`;
}

/** Verknüpft Hinweis- und Fehlertext per aria-describedby. */
export function describedBy(name: string, hasHint: boolean, error?: string) {
  return [hasHint ? hintId(name) : null, error ? errorId(name) : null].filter(Boolean).join(" ") || undefined;
}

export function FieldError({ name, error }: { name: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={errorId(name)} className={styles.error}>
      {error}
    </p>
  );
}

interface FieldProps {
  name: string;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}

export function Field({ name, label, optional, hint, error, children }: FieldProps) {
  return (
    <div className={styles.field} data-invalid={!!error || undefined}>
      <label htmlFor={fieldId(name)} className={styles.label}>
        {label}
        {optional ? <span className={styles.optional}> (optional)</span> : null}
      </label>
      {hint ? (
        <p id={hintId(name)} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {children}
      <FieldError name={name} error={error} />
    </div>
  );
}
