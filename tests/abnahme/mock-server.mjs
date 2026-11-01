// Nachbildung von apaleo (Identity + Availability v1) und Resend für lokale Abnahmetests.
// Zustand setzen: POST http://localhost:4010/__state  {"apaleo":"500","booked":["2027-02-10"],...}
import http from "node:http";
import { readFileSync } from "node:fs";
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/altus-2027-10.json", import.meta.url), "utf8"));
const S = { apaleo: "ok", resend: "ok", booked: [], maint: [], nightBlocked: [], blockDays: [], mails: [], calls: [], tokenCalls: 0, dropDay: null };
function days(from, to) { const out = []; let d = new Date(from + "T00:00:00Z"); const e = new Date(to + "T00:00:00Z"); while (d <= e) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); } return out; }
// Offset Europe/Berlin für einen lokalen Zeitpunkt (Tag + Stunde)
function off(day, hour) { const t = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`); const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(t)); const o = (h - hour + 24) % 24; return `+0${o}:00`; }
const at = (day, hour) => `${day}T${String(hour).padStart(2, "0")}:00:00${off(day, hour)}`;
const next = (day) => new Date(Date.parse(day + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
function json(res, code, body) { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); }
http.createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__state") { if (req.method === "POST") Object.assign(S, JSON.parse(body)); return json(res, 200, S); }
  if (url.pathname === "/connect/token") {
    S.tokenCalls++;
    if (S.apaleo === "tokenfail") return json(res, 401, { error: "invalid_client" });
    if (!/^Basic /.test(req.headers.authorization || "") || !body.includes("grant_type=client_credentials")) return json(res, 400, {});
    const payload = Buffer.from(JSON.stringify({ scope: S.scopes ?? ["availability.read"], client_id: "test" })).toString("base64url");
    return json(res, 200, { access_token: "tok-" + Date.now() + "." + payload + ".sig", expires_in: 3600, token_type: "Bearer" });
  }
  if (url.pathname === "/availability/v1/unit-groups") {
    S.calls.push(Object.fromEntries(url.searchParams));
    if (S.apaleo === "tokenfail" || !/^Bearer tok-/.test(req.headers.authorization || "")) return json(res, 401, {});
    if (S.apaleo === "500") return json(res, 500, { message: "boom" });
    if (S.apaleo === "204") { res.writeHead(204); return res.end(); }
    if (S.apaleo === "garbage") return json(res, 200, { foo: 1 });
    if (S.apaleo === "timeout") return; // nie antworten
    const p = url.searchParams, tpl = p.get("timeSliceTemplate");
    if (S.apaleo === "fixture") {
      // Echte apaleo-Antworten (siehe fixtures/), gefiltert auf from..to
      const slices = FIXTURE[tpl].filter((ts) => ts.from.slice(0, 10) >= p.get("from") && ts.from.slice(0, 10) <= p.get("to"));
      return json(res, 200, { timeSlices: slices, count: slices.length });
    }
    // Feingranularer Client: nur freigegebene Properties, sonst 403
    if (!(S.allowedProps ?? ["ALTUS"]).includes(p.get("propertyId"))) return json(res, 403, { message: "Forbidden" });
    if (!p.get("unitGroupIds")) return json(res, 200, { timeSlices: [], count: 0 });
    if (p.get("propertyId") !== "ALTUS" || p.get("unitGroupIds") !== "ALTUS-SPACE") return json(res, 400, { message: "bad ids" });
    const slices = days(p.get("from"), p.get("to")).filter((d) => d !== S.dropDay).map((d) => {
      const isDay = tpl === "DayUse";
      const booked = isDay && S.booked.includes(d);
      const maint = S.maint.includes(d);
      const night = !isDay && S.nightBlocked.includes(d);
      const blk = S.blockDays.includes(d);
      const from = isDay ? at(d, 10) : at(d, 16);
      const to = isDay ? at(d, S.apaleo === "gap" ? 15 : 16) : at(next(d), 10);
      const ug = { unitGroup: { id: "ALTUS-SPACE", code: "SPACE", name: "SPACE" }, availableCount: booked || maint || night ? 0 : 1, sellableCount: 1, physicalCount: 1, houseCount: 1,
        maintenance: { outOfService: 0, outOfOrder: 0, outOfInventory: maint ? 1 : 0 }, block: { definite: blk ? 1 : 0, tentative: 0, optional: 0, remaining: 0 } };
      if (S.apaleo === "noCount") delete ug.availableCount;
      return { from, to, unitGroups: S.apaleo === "noUG" ? [] : [ug] };
    });
    return json(res, 200, { timeSlices: slices, count: slices.length });
  }
  if (url.pathname === "/domains") return json(res, 401, { statusCode: 401, name: "restricted_api_key", message: "This API key is restricted to only send emails" });
  if (url.pathname === "/emails") {
    const b = JSON.parse(body);
    if (S.resend === "fail" || (S.resend === "failGuest" && !String(b.to).includes("stay@"))) return json(res, 500, { name: "internal_server_error", message: "x" });
    if (S.resend === "422") return json(res, 422, { name: "validation_error", message: "domain not verified" });
    S.mails.push({ to: b.to, from: b.from, subject: b.subject, reply_to: b.reply_to, key: req.headers["idempotency-key"], text: b.text, auth: (req.headers.authorization||"").slice(0,10) });
    return json(res, 200, { id: "re_" + S.mails.length });
  }
  json(res, 404, {});
}).listen(4010, () => console.log("mock 4010"));
