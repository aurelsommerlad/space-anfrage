import "server-only";

/**
 * Protokollierung ohne vollständige personenbezogene Daten.
 * E-Mail-Adressen werden maskiert, freie Texte nie protokolliert.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "-";
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain.replace(/^[^.]*/, (d) => d.slice(0, 1) + "***")}`;
}

function scrub(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: scrubText(value.message) };
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (/^(name|message|phone|company|email|body|text|html)$/i.test(k)) continue;
      out[k] = scrub(v);
    }
    return out;
  }
  return value;
}

function scrubText(s: string): string {
  return s.replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi, (m) => maskEmail(m)).slice(0, 500);
}

export const log = {
  info(event: string, data?: Record<string, unknown>) {
    console.info(`[anfrage] ${event}`, data ? JSON.stringify(scrub(data)) : "");
  },
  warn(event: string, data?: Record<string, unknown>) {
    console.warn(`[anfrage] ${event}`, data ? JSON.stringify(scrub(data)) : "");
  },
  error(event: string, data?: Record<string, unknown>) {
    console.error(`[anfrage] ${event}`, data ? JSON.stringify(scrub(data)) : "");
  },
};
