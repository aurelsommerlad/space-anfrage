import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { occasionLabel, type OccasionId } from "@/lib/booking";
import { formatDateLong } from "@/lib/dates";
import { getModeState } from "@/server/config";
import { isAdminAuthorization } from "@/server/admin-auth";
import { getRequest, REQUEST_STATUSES, STATUS_LABEL, type RequestStatus } from "@/server/requests";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Anfrage · SPACE im HØV (intern)", robots: { index: false, follow: false } };

const MAIL_LABEL = { intern: "Benachrichtigung an das Team", bestaetigung: "Eingangsbestätigung an Interessent:in" } as const;

export default async function RequestPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ ok?: string }> }) {
  if (!isAdminAuthorization((await headers()).get("authorization"))) notFound();
  const state = getModeState();
  if (state.mode !== "live") notFound();
  const { ref } = await params;
  const { ok } = await searchParams;
  if (!/^SPACE-\d{4}-[0-9A-Z]{4}$/.test(ref)) notFound();
  const data = await getRequest(state.config, ref);
  if (!data) notFound();
  const { request: r, emails } = data;
  const fields: [string, string][] = [
    ["Eingang", new Date(r.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })],
    ["Termin", r.start_date === r.end_date ? formatDateLong(r.start_date) : `${formatDateLong(r.start_date)} bis ${formatDateLong(r.end_date)}`],
    ["Uhrzeit", `${r.start_time} bis ${r.end_time} Uhr`],
    ["Anlass", occasionLabel(r.occasion as OccasionId)],
    ["Personen", String(r.guests)],
    ["Übernachtung", r.overnight ? "Gewünscht" : "Nicht gewünscht"],
    ["Wünsche", r.message || "–"],
    ["Name", r.name],
    ["E-Mail", r.email],
    ["Unternehmen", r.company || "–"],
    ["Telefon", r.phone || "–"],
    ["Umgebung", r.environment],
  ];
  return (
    <main className={styles.page}>
      <p className={styles.meta}>
        <Link href="/intern">← Alle Anfragen</Link>
      </p>
      <h1>{r.reference}</h1>
      {ok ? <p className={styles.notice}>{ok === "status" ? "Gespeichert." : `E-Mail-Versand erneut ausgeführt.`}</p> : null}
      <dl className={styles.dl}>
        {fields.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <h2>Status</h2>
      <form className={styles.form} method="post" action={`/api/intern/anfragen/${r.reference}`}>
        <input type="hidden" name="action" value="status" />
        <select name="status" defaultValue={r.status} aria-label="Status">
          {REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s as RequestStatus]}
            </option>
          ))}
        </select>
        <textarea name="note" rows={4} defaultValue={r.internal_note} placeholder="Interne Notiz" aria-label="Interne Notiz" />
        <button className={styles.button} type="submit">
          Speichern
        </button>
      </form>

      <h2>E-Mails</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Art</th>
            <th>Status</th>
            <th>Versuche</th>
            <th>Gesendet</th>
            <th>Letzter Fehler</th>
          </tr>
        </thead>
        <tbody>
          {emails.map((e) => (
            <tr key={e.id}>
              <td>{MAIL_LABEL[e.kind]}</td>
              <td>
                <span className={`${styles.badge} ${e.status === "fehlgeschlagen" ? styles.bad : ""}`}>{e.status}</span>
              </td>
              <td>{e.attempts}</td>
              <td>{e.sent_at ? new Date(e.sent_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "–"}</td>
              <td>{e.last_error ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {emails.some((e) => e.status !== "gesendet") ? (
        <form className={styles.form} method="post" action={`/api/intern/anfragen/${r.reference}`}>
          <input type="hidden" name="action" value="retry" />
          <button className={`${styles.button} ${styles.secondary}`} type="submit">
            Nicht versendete E-Mails erneut senden
          </button>
        </form>
      ) : null}
    </main>
  );
}
