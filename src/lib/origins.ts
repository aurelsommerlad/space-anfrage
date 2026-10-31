/**
 * Erlaubte Origins für die iframe-Einbindung (/embed).
 *
 * Quelle: Umgebungsvariable EMBED_ALLOWED_ORIGINS, z. B.
 *   "https://www.beispiel.de https://beispiel.de"
 * Getrennt durch Leerzeichen oder Kommas. Nur vollständige Origins
 * (Schema + Host + optional Port), ohne Pfad. http ist nur für localhost
 * erlaubt. Ungültige Einträge werden ignoriert.
 *
 * Bewusst ohne Imports, damit next.config.ts die Datei nutzen kann.
 */
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const out = new Set<string>();
  for (const part of raw.split(/[\s,]+/)) {
    const value = part.trim().replace(/\/+$/, "");
    if (!value) continue;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      continue;
    }
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) continue;
    if (url.pathname !== "/" || url.search || url.hash || url.username) continue;
    out.add(url.origin);
  }
  return [...out];
}
