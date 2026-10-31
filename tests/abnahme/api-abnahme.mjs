/**
 * API-Abnahme für den Live-Modus – gegen nachgebildetes apaleo/Resend und eine lokale Postgres.
 * Es werden keine echten Buchungen, Sperren oder E-Mails erzeugt.
 *
 * 1. Postgres starten und leere Datenbank anlegen (z. B. space_test).
 * 2. node tests/abnahme/mock-server.mjs                      (Port 4010)
 * 3. source tests/abnahme/test.env && npm run build && npx next start -p 3100
 * 4. node tests/abnahme/api-abnahme.mjs   (Datenbank: ABNAHME_DATABASE_URL, Standard lokale space_test)
 */
import { randomUUID } from "node:crypto";
const APP = "http://localhost:3100", MOCK = "http://localhost:4010";
const RUN = Date.now().toString(36);
let pass = 0, failN = 0; const results = [];
function check(name, cond, info = "") { results.push(`${cond ? "OK  " : "FAIL"} ${name}${cond ? "" : "  " + info}`); cond ? pass++ : failN++; }
async function mock(s) { const r = await fetch(MOCK + "/__state", { method: "POST", body: JSON.stringify(s) }); return r.json(); }
async function mockState() { return (await fetch(MOCK + "/__state")).json(); }
let ipN = 1;
function body(o = {}) { return { startDate: "2027-02-10", endDate: "2027-02-10", startTime: "10:00", endTime: "16:00", occasion: "seminar", guests: 12, message: "Test", overnight: false,
  name: "Erika Testfrau", email: `erika.${RUN}.${ipN}@example.org`, company: "", phone: "", idempotencyKey: randomUUID(), startedAt: Date.now() - 10000, ...o }; }
async function submit(b, ip = `10.0.${RUN.length}.${ipN++}`) {
  const r = await fetch(APP + "/api/anfrage", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify(b) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const reset = { apaleo: "ok", resend: "ok", booked: [], maint: [], nightBlocked: [], blockDays: [], mails: [], calls: [], dropDay: null };
import pg from "postgres";
const sql = pg(process.env.ABNAHME_DATABASE_URL ?? "postgresql://pgadmin@localhost:5433/space_test");
const count = async (email) => (await sql`select count(*)::int c from anfragen where email = ${email}`)[0].c;
const AUTH = "Basic " + Buffer.from("team:test-passwort-123").toString("base64");

const CM = "2028-0" + (1 + Math.floor(Math.random()*9));
// 1 Kalender: belegte Tage, Wartung, Nacht-Sperre, Block
await mock({ ...reset, booked: [CM + "-03"], maint: [CM + "-10"], nightBlocked: [CM + "-15"], blockDays: [CM + "-20"] });
let r = await fetch(`${APP}/api/availability?from=${CM}&to=${CM}`); let j = await r.json();
check("Kalender: belegt/Wartung/Abendsperre/Block erkannt (Nachtsperre wirkt bis 10 Uhr Folgetag)", r.status === 200 && JSON.stringify(j.bookedDates) === JSON.stringify([CM + "-03",CM + "-10",CM + "-11",CM + "-15",CM + "-16",CM + "-20",CM + "-21"]) && j.source === "apaleo", JSON.stringify(j));
let st = await mockState();
check("Kalender: DayUse + OverNight, Zeitraum inkl. letztem Tag", st.calls.some(c => c.timeSliceTemplate === "DayUse" && c.to === CM + "-" + new Date(Date.UTC(+CM.slice(0,4), +CM.slice(5), 0)).getUTCDate()) && st.calls.some(c => c.timeSliceTemplate === "OverNight"), JSON.stringify(st.calls));

// 2 freier Termin
await mock(reset);
let b = body(); r = await submit(b);
check("Freier Termin: gespeichert, Referenz", r.status === 200 && /^SPACE-\d{4}-[0-9A-Z]{4}$/.test(r.json?.reference) && r.json.demo === false, JSON.stringify(r));
const ref1 = r.json?.reference;
const row = (await sql`select * from anfragen where reference = ${ref1}`)[0];
check("DB: Status neu, Umgebung preview", row?.status === "neu" && row?.environment === "preview", JSON.stringify(row?.status));
st = await mockState();
check("Frische apaleo-Prüfung beim Absenden: DayUse am Tag, OverNight ab Vortag", st.calls.some(c => c.timeSliceTemplate === "DayUse" && c.from === "2027-02-10" && c.to === "2027-02-10") && st.calls.some(c => c.timeSliceTemplate === "OverNight" && c.from === "2027-02-09" && c.to === "2027-02-10"), JSON.stringify(st.calls));
const intern = st.mails.find(m => m.to.includes("stay@unique-places.com")); const guest = st.mails.find(m => m.to.includes(b.email));
check("Mail intern an stay@ mit Reply-To Interessent", intern && intern.reply_to === b.email && intern.subject.includes(ref1), JSON.stringify(intern));
check("Bestätigung an Interessent: Zusammenfassung + unverbindlich", guest && guest.text.includes("unverbindlich und noch keine Reservierung") && guest.text.includes("Anfragenummer: " + ref1) && guest.text.includes("Personen: 12") && guest.reply_to === "stay@unique-places.com", guest?.text);
check("Idempotency-Key an Resend", intern?.key === `${ref1}-intern` && guest?.key === `${ref1}-bestaetigung`);
const em = await sql`select kind,status from anfrage_emails where anfrage_id = ${row.id}`;
check("Mail-Protokoll: beide gesendet", em.length === 2 && em.every(e => e.status === "gesendet"), JSON.stringify(em));

// 3 Doppelte Einsendung
r = await submit(b);
check("Doppelt (gleicher Schlüssel): gleiche Referenz", r.status === 200 && r.json.reference === ref1, JSON.stringify(r));
r = await submit({ ...b, idempotencyKey: randomUUID() });
check("Doppelt (neuer Schlüssel, gleicher Inhalt): gleiche Referenz", r.status === 200 && r.json.reference === ref1, JSON.stringify(r));
check("Doppelt: nur 1 Datensatz, keine weiteren Mails", (await count(b.email)) === 1 && (await mockState()).mails.length === 2);
const bp = body(); const par = await Promise.all([0,1,2,3,4].map(() => submit(bp)));
check("Parallel 5x gleiche Anfrage: 1 Datensatz, 1 Referenz", (await count(bp.email)) === 1 && new Set(par.map(p => p.json?.reference)).size === 1 && par.every(p => p.status === 200), JSON.stringify(par.map(p=>p.status)));

// 4 belegter Termin
await mock({ ...reset, booked: ["2027-02-11"] });
b = body({ startDate: "2027-02-11", endDate: "2027-02-11" }); r = await submit(b);
check("Belegter Termin: 409, nicht gespeichert", r.status === 409 && r.json.conflictDates?.[0] === "2027-02-11" && (await count(b.email)) === 0, JSON.stringify(r));
// 5 mehrtägig, letzter Tag belegt
await mock({ ...reset, booked: ["2027-02-14"] });
b = body({ startDate: "2027-02-12", endDate: "2027-02-14", endTime: "14:00" }); r = await submit(b);
check("Mehrtägig, letzter Tag belegt: 409", r.status === 409 && JSON.stringify(r.json.conflictDates) === '["2027-02-14"]', JSON.stringify(r));
await mock({ ...reset }); r = await submit(b);
check("Mehrtägig frei: gespeichert, Prüfung 12.–14.", r.status === 200 && (await mockState()).calls.some(c => c.from === "2027-02-12" && c.to === "2027-02-14"), JSON.stringify(r));
// 6 Sperren
for (const [k, label] of [["maint", "Wartung"], ["nightBlocked", "Abendsperre (OverNight)"], ["blockDays", "Block"]]) {
  await mock({ ...reset, [k]: ["2027-02-20"] }); b = body({ startDate: "2027-02-20", endDate: "2027-02-20" }); r = await submit(b);
  check(`Sperre ${label}: 409, nicht gespeichert`, r.status === 409 && (await count(b.email)) === 0, JSON.stringify(r));
}
// 6b Lückenlose Tagesabdeckung
await mock({ ...reset, nightBlocked: ["2027-02-27"] }); b = body({ startDate: "2027-02-28", endDate: "2027-02-28", startTime: "08:00", endTime: "12:00" }); r = await submit(b);
check("Sperre bis 10 Uhr (Nachtscheibe Vortag) blockiert Morgen des Folgetags: 409", r.status === 409 && r.json.conflictDates?.[0] === "2027-02-28" && (await count(b.email)) === 0, JSON.stringify(r));
await mock({ ...reset, booked: ["2027-03-01"] }); b = body({ startDate: "2027-03-02", endDate: "2027-03-02", startTime: "06:00", endTime: "24:00" }); r = await submit(b);
check("Tagesbuchung am Vortag blockiert Folgetag nicht (06–24 Uhr frei): 200", r.status === 200, JSON.stringify(r));
for (const mode of ["noCount", "noUG", "gap"]) {
  await mock({ ...reset, apaleo: mode }); b = body({ startDate: "2027-03-04", endDate: "2027-03-04" }); r = await submit(b);
  check(`Unvollständige apaleo-Antwort (${mode}): 503 „nicht prüfbar“, nicht 409 „belegt“`, r.status === 503 && !r.json.conflictDates && (await count(b.email)) === 0, JSON.stringify(r));
  const av = await fetch(`${APP}/api/availability?from=2029-0${["noCount","noUG","gap"].indexOf(mode)+1}&to=2029-0${["noCount","noUG","gap"].indexOf(mode)+1}`);
  check(`Kalender bei ${mode}: 503 statt belegter Tage`, av.status === 503);
}
// 6c Echte apaleo-Daten (Wartung 22.10.2027 16:00 – 24.10.2027 10:00)
await mock({ ...reset, apaleo: "fixture" });
b = body({ startDate: "2027-10-22", endDate: "2027-10-25", endTime: "18:00" }); r = await submit(b);
check("Echte apaleo-Daten: 22.–25.10.2027 → belegt 22., 23., 24. (Abend, ganztags, Morgen)", r.status === 409 && JSON.stringify(r.json.conflictDates) === '["2027-10-22","2027-10-23","2027-10-24"]', JSON.stringify(r.json));
b = body({ startDate: "2027-10-24", endDate: "2027-10-24", startTime: "12:00", endTime: "15:00" }); r = await submit(b);
check("Echte apaleo-Daten: 24.10.2027 nicht ganztägig frei (Sperre bis 10 Uhr) → als belegt gewertet", r.status === 409, JSON.stringify(r.json));
b = body({ startDate: "2027-10-25", endDate: "2027-10-25", startTime: "06:00", endTime: "24:00" }); r = await submit(b);
check("Echte apaleo-Daten: 25.10.2027 06–24 Uhr → frei, gespeichert", r.status === 200, JSON.stringify(r.json));
// 7 API-Ausfall
for (const mode of ["500", "204", "garbage", "tokenfail", "timeout"]) {
  await mock({ ...reset, apaleo: mode }); b = body({ startDate: "2027-02-22", endDate: "2027-02-22" }); r = await submit(b);
  check(`apaleo-Ausfall ${mode}: 503, nichts gespeichert`, r.status === 503 && (await count(b.email)) === 0, JSON.stringify(r));
}
await mock({ ...reset, dropDay: "2027-02-24" }); b = body({ startDate: "2027-02-23", endDate: "2027-02-24", endTime: "12:00" }); r = await submit(b);
check("apaleo: fehlender Tag in Antwort → 503 (nie frei)", r.status === 503 && (await count(b.email)) === 0, JSON.stringify(r));
await mock({ ...reset, apaleo: "500" }); r = await fetch(APP + "/api/availability?from=2027-07&to=2027-08");
check("Kalender bei apaleo-Ausfall: 503", r.status === 503);

// 8 E-Mail-Ausfall + Wiederholung
await mock({ ...reset, resend: "fail" }); b = body({ startDate: "2027-02-25", endDate: "2027-02-25" }); r = await submit(b);
check("E-Mail-Ausfall: Anfrage trotzdem gespeichert, Erfolg", r.status === 200 && (await count(b.email)) === 1, JSON.stringify(r));
const ref2 = r.json.reference;
let em2 = await sql`select e.kind,e.status,e.last_error,e.attempts from anfrage_emails e join anfragen a on a.id=e.anfrage_id where a.reference=${ref2}`;
check("E-Mail-Ausfall protokolliert (fehlgeschlagen + Fehler)", em2.every(e => e.status === "fehlgeschlagen" && e.last_error), JSON.stringify(em2));
r = await fetch(APP + "/api/cron/mail-retry"); check("Cron ohne Secret: 401", r.status === 401);
await mock({ resend: "ok" });
r = await fetch(`${APP}/api/intern/anfragen/${ref2}`, { method: "POST", redirect: "manual", headers: { authorization: AUTH, origin: APP }, body: new URLSearchParams({ action: "retry" }) });
em2 = await sql`select e.status from anfrage_emails e join anfragen a on a.id=e.anfrage_id where a.reference=${ref2}`;
check("Erneut senden (Übersicht): beide gesendet", r.status === 303 && em2.every(e => e.status === "gesendet"), r.status + JSON.stringify(em2));
await mock({ ...reset, resend: "failGuest" }); b = body({ startDate: "2027-02-26", endDate: "2027-02-26" }); r = await submit(b); const ref3 = r.json.reference;
await sql`update anfrage_emails set updated_at = now() - interval '5 minutes' where anfrage_id = (select id from anfragen where reference=${ref3})`;
await mock({ resend: "ok" });
r = await fetch(APP + "/api/cron/mail-retry", { headers: { authorization: "Bearer cron-secret-123456" } }); j = await r.json();
const em3 = await sql`select e.kind,e.status from anfrage_emails e join anfragen a on a.id=e.anfrage_id where a.reference=${ref3}`;
st = await mockState();
check("Cron-Wiederholung: nur Bestätigung nachgesendet, intern nicht doppelt", em3.every(e => e.status === "gesendet") && st.mails.filter(m => m.subject.includes(ref3)).length === 2, JSON.stringify(em3) + JSON.stringify(j));

// 9 Spam / Validierung / Rate-Limit
await mock(reset);
b = body({ website: "x" }); r = await fetch(APP + "/api/anfrage", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "10.9.9.1" }, body: JSON.stringify(b) }); j = await r.json();
check("Honeypot: still OK, nicht gespeichert, keine Mail", r.status === 422 || (r.status === 200 && j.reference === "—" && (await count(b.email)) === 0), r.status + JSON.stringify(j));
b = body({ startedAt: Date.now() }); r = await submit(b);
check("Zu schnell ausgefüllt: 429, nicht gespeichert", r.status === 429 && (await count(b.email)) === 0);
r = await submit(body({ email: "kaputt", guests: 0 }));
check("Serverseitige Validierung: 422 mit Feldfehlern", r.status === 422 && r.json.fieldErrors?.email && r.json.fieldErrors?.guests, JSON.stringify(r.json));
r = await submit(body({ startDate: "2026-10-01", endDate: "2026-10-01" }));
check("Vergangenes Datum: 422", r.status === 422);
const ipRL = "10.77." + Math.floor(Math.random()*250) + ".1"; const codes = [];
for (let i = 0; i < 6; i++) codes.push((await submit(body({ startDate: "2027-04-0" + (i + 1), endDate: "2027-04-0" + (i + 1), email: `rl${i}.${RUN}@example.org` }), ipRL)).status);
check("Rate-Limit: 6. Anfrage in 10 Min. → 429", codes.slice(0, 5).every(c => c === 200) && codes[5] === 429, JSON.stringify(codes));

// 10 Admin-Zugang
r = await fetch(APP + "/intern"); check("Übersicht ohne Login: 401", r.status === 401);
r = await fetch(APP + "/intern", { headers: { authorization: "Basic " + Buffer.from("team:falsch-falsch-123").toString("base64") } }); check("Übersicht falsches Passwort: 401", r.status === 401);
r = await fetch(APP + "/intern", { headers: { authorization: AUTH } }); let html = await r.text();
check("Übersicht mit Login: Liste enthält Referenz, noindex/no-store", r.status === 200 && html.includes(ref1) && /noindex/.test(r.headers.get("x-robots-tag") || "") && /no-store/.test(r.headers.get("cache-control") || ""));
r = await fetch(`${APP}/intern/${ref1}`, { headers: { authorization: AUTH } }); html = await r.text();
check("Detailseite mit Login", r.status === 200 && html.includes("Erika Testfrau"));
r = await fetch(`${APP}/api/intern/anfragen/${ref1}`, { method: "POST", redirect: "manual", headers: { authorization: AUTH, origin: "https://boese.example" }, body: new URLSearchParams({ action: "status", status: "abgelehnt" }) });
check("Fremde Origin (CSRF): 403", r.status === 403);
r = await fetch(`${APP}/api/intern/anfragen/${ref1}`, { method: "POST", redirect: "manual", headers: { authorization: AUTH, origin: APP }, body: new URLSearchParams({ action: "status", status: "in_bearbeitung", note: "Rückruf" }) });
check("Status ändern", r.status === 303 && (await sql`select status from anfragen where reference=${ref1}`)[0].status === "in_bearbeitung");
r = await fetch(`${APP}/api/intern/anfragen/${ref1}`, { method: "POST", body: new URLSearchParams({ action: "status", status: "neu" }) });
check("Aktion ohne Login: 401", r.status === 401);
r = await fetch(APP + "/"); html = await r.text();
check("Öffentliche Seite enthält keine gespeicherten Anfragen", !html.includes(ref1) && !html.includes("Erika"));

await sql.end();
console.log(results.join("\n")); console.log(`\n${pass} OK, ${failN} FAIL`);
