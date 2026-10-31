import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { occasionLabel, type OccasionId } from "@/lib/booking";
import { formatRange } from "@/lib/dates";
import { getModeState } from "@/server/config";
import { isAdminAuthorization } from "@/server/admin-auth";
import { listRequests, STATUS_LABEL, type RequestStatus } from "@/server/requests";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Anfragen · SPACE im HØV (intern)", robots: { index: false, follow: false } };

export default async function InternPage() {
  if (!isAdminAuthorization((await headers()).get("authorization"))) notFound();
  const state = getModeState();
  if (state.mode !== "live") {
    return (
      <main className={styles.page}>
        <h1>Anfragen</h1>
        <p className={styles.notice}>
          {state.mode === "demo"
            ? "Demomodus: Es werden keine Anfragen gespeichert."
            : `Live-Konfiguration unvollständig: ${state.problems.join(", ")}.`}
        </p>
      </main>
    );
  }
  const rows = await listRequests(state.config);
  return (
    <main className={styles.page}>
      <h1>Anfragen</h1>
      <p className={styles.meta}>
        Umgebung: {state.config.environment} · {rows.length} Anfragen (neueste zuerst)
      </p>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Referenz</th>
              <th>Eingang</th>
              <th>Termin</th>
              <th>Pers.</th>
              <th>Anlass</th>
              <th>Name</th>
              <th>Status</th>
              <th>E-Mails</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/intern/${r.reference}`}>{r.reference}</Link>
                </td>
                <td>{new Date(r.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}</td>
                <td>{formatRange(r.start_date, r.end_date === r.start_date ? null : r.end_date)}</td>
                <td>{r.guests}</td>
                <td>{occasionLabel(r.occasion as OccasionId)}</td>
                <td>{r.name}</td>
                <td>
                  <span className={styles.badge}>{STATUS_LABEL[r.status as RequestStatus] ?? r.status}</span>
                </td>
                <td>
                  {r.mail_failed ? <span className={`${styles.badge} ${styles.bad}`}>{r.mail_failed} fehlgeschlagen</span> : r.mail_pending ? <span className={styles.badge}>ausstehend</span> : "ok"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
