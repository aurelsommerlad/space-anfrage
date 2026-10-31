import "server-only";

/** Client-IP aus den Proxy-Headern (Vercel setzt x-forwarded-for / x-real-ip). */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "unbekannt").trim();
}

/** Einfaches Rate-Limit im Speicher der Instanz (für leichte, häufige Abfragen). */
const buckets = new Map<string, { start: number; hits: number }>();
export function memoryRateLimit(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > windowMs) {
    buckets.set(key, { start: now, hits: 1 });
    if (buckets.size > 5000) buckets.delete(buckets.keys().next().value!);
    return true;
  }
  b.hits++;
  return b.hits <= max;
}
