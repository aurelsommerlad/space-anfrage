// Nachbildung von apaleo (Identity + Availability v1) und Resend für lokale Abnahmetests.
// Zustand setzen: POST http://localhost:4010/__state  {"apaleo":"500","booked":["2027-02-10"],...}
import http from "node:http";
const S = { apaleo: "ok", resend: "ok", booked: [], maint: [], nightBlocked: [], blockDays: [], mails: [], calls: [], tokenCalls: 0, dropDay: null };
function days(from, to) { const out = []; let d = new Date(from + "T00:00:00Z"); const e = new Date(to + "T00:00:00Z"); while (d <= e) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); } return out; }
function off(day) { const m = Number(day.slice(5, 7)); return m >= 4 && m <= 10 ? "+02:00" : "+01:00"; } // vereinfachte Sommerzeit, genügt für Tests
function json(res, code, body) { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); }
http.createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__state") { if (req.method === "POST") Object.assign(S, JSON.parse(body)); return json(res, 200, S); }
  if (url.pathname === "/connect/token") {
    S.tokenCalls++;
    if (S.apaleo === "tokenfail") return json(res, 401, { error: "invalid_client" });
    if (!/^Basic /.test(req.headers.authorization || "") || !body.includes("grant_type=client_credentials")) return json(res, 400, {});
    return json(res, 200, { access_token: "tok-" + Date.now(), expires_in: 3600, token_type: "Bearer" });
  }
  if (url.pathname === "/availability/v1/unit-groups") {
    S.calls.push(Object.fromEntries(url.searchParams));
    if (S.apaleo === "tokenfail" || !/^Bearer tok-/.test(req.headers.authorization || "")) return json(res, 401, {});
    if (S.apaleo === "500") return json(res, 500, { message: "boom" });
    if (S.apaleo === "204") { res.writeHead(204); return res.end(); }
    if (S.apaleo === "garbage") return json(res, 200, { foo: 1 });
    if (S.apaleo === "timeout") return; // nie antworten
    const p = url.searchParams, tpl = p.get("timeSliceTemplate");
    if (p.get("propertyId") !== "ALTUS" || p.get("unitGroupIds") !== "ALTUS-SPACE") return json(res, 400, { message: "bad ids" });
    const slices = days(p.get("from"), p.get("to")).filter((d) => d !== S.dropDay).map((d) => {
      const isDay = tpl === "DayUse";
      const booked = isDay && S.booked.includes(d);
      const maint = S.maint.includes(d);
      const night = !isDay && S.nightBlocked.includes(d);
      const blk = S.blockDays.includes(d);
      const from = isDay ? `${d}T10:00:00${off(d)}` : `${d}T16:00:00${off(d)}`;
      return { from, to: from, unitGroups: [{ unitGroup: { id: "ALTUS-SPACE", code: "SPACE", name: "SPACE" }, availableCount: booked || maint || night ? 0 : 1, sellableCount: 1, physicalCount: 1, houseCount: 1,
        maintenance: { outOfService: 0, outOfOrder: 0, outOfInventory: maint ? 1 : 0 }, block: { definite: blk ? 1 : 0, tentative: 0, optional: 0, remaining: 0 } }] };
    });
    return json(res, 200, { timeSlices: slices, count: slices.length });
  }
  if (url.pathname === "/emails") {
    const b = JSON.parse(body);
    if (S.resend === "fail" || (S.resend === "failGuest" && !String(b.to).includes("stay@"))) return json(res, 500, { name: "internal_server_error", message: "x" });
    if (S.resend === "422") return json(res, 422, { name: "validation_error", message: "domain not verified" });
    S.mails.push({ to: b.to, from: b.from, subject: b.subject, reply_to: b.reply_to, key: req.headers["idempotency-key"], text: b.text, auth: (req.headers.authorization||"").slice(0,10) });
    return json(res, 200, { id: "re_" + S.mails.length });
  }
  json(res, 404, {});
}).listen(4010, () => console.log("mock 4010"));
