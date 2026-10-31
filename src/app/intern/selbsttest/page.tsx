import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isAdminAuthorization } from "@/server/admin-auth";
import { runSelftest, type CheckStatus } from "@/server/selftest";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Selbsttest · SPACE im HØV (intern)", robots: { index: false, follow: false } };

const LABEL: Record<CheckStatus, string> = { ok: "OK", warn: "Hinweis", fail: "Fehler", info: "Info" };

export default async function SelftestPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isAdminAuthorization((await headers()).get("authorization"))) notFound();
  const sp = await searchParams;
  const { checks, ready, mode } = await runSelftest();
  const groups = [...new Set(checks.map((c) => c.group))];
  return (
    <main className={styles.page}>
      <p>
        <Link href="/intern">← Anfragen</Link>
      </p>
      <h1>Selbsttest</h1>
      <p className={styles.meta}>
        Prüft Konfiguration, Datenbank, apaleo-Zugang (nur lesend) und E-Mail-Versand. Es werden keine Zugangsdaten angezeigt und
        nichts in apaleo verändert. Stand: {new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
      </p>
      {sp.mail === "ok" ? <p className={styles.notice}>Test-E-Mail wurde von Resend angenommen. Bitte den Eingang im Postfach prüfen.</p> : null}
      {sp.mail === "fail" ? <p className={`${styles.notice} ${styles.noticeBad}`}>Test-E-Mail fehlgeschlagen: {sp.grund ?? "unbekannter Fehler"}</p> : null}
      {sp.schema === "ok" ? <p className={styles.notice}>Schema wurde angelegt bzw. ist aktuell.</p> : null}
      {sp.schema === "fail" ? <p className={`${styles.notice} ${styles.noticeBad}`}>Schema konnte nicht angelegt werden: {sp.grund ?? "unbekannter Fehler"}</p> : null}
      <p className={`${styles.notice} ${ready ? "" : styles.noticeBad}`} data-ready={ready ? "ja" : "nein"}>
        {ready
          ? mode === "live"
            ? "Alle Prüfungen bestanden. Live-Betrieb aktiv."
            : "Alle Prüfungen bestanden. Bereit für BOOKING_MODE=live."
          : "Noch nicht bereit: Bitte die mit „Fehler“ markierten Punkte beheben."}
      </p>
      {groups.map((g) => (
        <section key={g}>
          <h2 className={styles.h2}>{g}</h2>
          <table className={styles.table}>
            <tbody>
              {checks
                .filter((c) => c.group === g)
                .map((c, i) => (
                  <tr key={i} data-status={c.status}>
                    <td style={{ width: 240 }}>{c.label}</td>
                    <td style={{ width: 90 }}>
                      <span className={`${styles.badge} ${c.status === "fail" ? styles.bad : ""}`}>{LABEL[c.status]}</span>
                    </td>
                    <td>{c.detail}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
      <form method="post" action="/api/intern/selbsttest" className={styles.form} style={{ marginTop: 32 }}>
        <button className={styles.button} name="action" value="schema">
          Schema jetzt anlegen
        </button>
        <button className={`${styles.button} ${styles.secondary}`} name="action" value="testmail">
          Test-E-Mail an MAIL_INTERNAL_TO senden
        </button>
      </form>
    </main>
  );
}
