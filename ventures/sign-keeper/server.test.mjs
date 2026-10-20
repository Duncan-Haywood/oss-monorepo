import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, newState } from "./server.mjs";

async function boot(over = {}) {
  const notes = [];
  const cfg = { state: newState(), save() {}, adminKey: "adm", ipSecret: "s", publicUrl: "https://p.example", company: "Acme <b>", notify: async (m) => { notes.push(m); }, now: () => Date.UTC(2026, 9, 15), ...over };
  const server = http.createServer(handler(cfg));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = (path, body, method) => fetch(base + path, { method: method || (body ? "POST" : "GET"), headers: { authorization: "Bearer adm" }, body: body ? JSON.stringify(body) : undefined });
  const post = (path, fields) => fetch(base + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });
  const create = async (b = {}) => (await admin("/v1/requests", { title: "NDA <script>", body: "Both sides keep the shared plans private for two years.", ...b })).json();
  return { cfg, base, admin, post, create, notes, close: () => { server.close(); server.closeAllConnections?.(); } };
}
const tokenOf = (u) => u.split("/").pop();

test("admin API needs the key", async () => {
  const s = await boot();
  for (const p of ["/v1/summary", "/v1/requests", "/v1/requests.csv"]) assert.equal((await fetch(s.base + p)).status, 401);
  assert.equal((await fetch(`${s.base}/v1/requests`, { method: "POST", body: "{}" })).status, 401);
  s.close();
});

test("end to end: create → view → sign → certificate verifies → JSON re-check", async () => {
  const s = await boot();
  const made = await s.create({ signerName: "Ada Lovelace" });
  assert.match(made.signUrl, /^https:\/\/p\.example\/s\/[\w-]{22}$/);
  const tok = tokenOf(made.signUrl);
  const page = await fetch(`${s.base}/s/${tok}`);
  const html = await page.text();
  assert.match(page.headers.get("content-security-policy"), /form-action 'self'/);
  assert.ok(!html.includes("<script>") && !html.includes("<b>")); assert.match(html, /NDA &lt;script&gt;/); assert.match(html, /name="consent"/);
  assert.equal((await s.post(`/s/${tok}`, { action: "sign", name: "Ada Lovelace" })).status, 400);
  const done = await s.post(`/s/${tok}`, { action: "sign", name: "Ada Lovelace", consent: "on" });
  assert.equal(done.status, 200); assert.match(await done.text(), /Signed/);
  assert.equal(s.notes.length, 1); assert.equal(s.notes[0].event, "signed");
  assert.equal((await s.post(`/s/${tok}`, { action: "sign", name: "Ada Lovelace", consent: "on" })).status, 400);
  const cert = await (await fetch(`${s.base}/c/${tok}`)).text();
  assert.match(cert, /Certificate of electronic signature/); assert.match(cert, /intact/); assert.ok(!cert.includes("<script>"));
  const j = await (await fetch(`${s.base}/c/${tok}.json`)).json();
  assert.equal(j.signedBy, "Ada Lovelace"); assert.equal(j.integrity.ok, true); assert.equal(j.events.map((e) => e.type).join(), "created,viewed,signed");
  assert.deepEqual(await (await s.admin("/v1/summary")).json(), { pending: 0, signed: 1, declined: 0, expired: 0, voided: 0 });
  const [row] = await (await s.admin("/v1/requests")).json();
  assert.ok(row.certUrl && !("body" in row));
  assert.match(await (await s.admin("/v1/requests.csv")).text(), /Ada Lovelace/);
  s.close();
});

test("tampered stored text is flagged on the certificate and refuses to sign", async () => {
  const s = await boot();
  const tok = tokenOf((await s.create()).signUrl);
  s.cfg.state.requests[tok].body += " And you owe us everything.";
  const r = await s.post(`/s/${tok}`, { action: "sign", name: "Ada L", consent: "on" });
  assert.equal(r.status, 400); assert.match(await r.text(), /fingerprint/);
  s.close();
});

test("decline, void, expiry, unknown and malformed tokens", async () => {
  let t = Date.UTC(2026, 9, 15);
  const s = await boot({ now: () => t });
  const a = tokenOf((await s.create()).signUrl);
  assert.match(await (await s.post(`/s/${a}`, { action: "decline", reason: "no" })).text(), /Declined/);
  assert.match(await (await fetch(`${s.base}/s/${a}`)).text(), /declined/);
  assert.equal((await fetch(`${s.base}/c/${a}`)).status, 404);
  const b = await s.create();
  assert.equal((await s.admin(`/v1/requests/${tokenOf(b.signUrl)}/void`, {})).status, 200);
  assert.match(await (await fetch(b.signUrl.replace("https://p.example", s.base))).text(), /voided/);
  const c = tokenOf((await s.create({ days: 1 })).signUrl);
  t += 2 * 86400000;
  assert.match(await (await fetch(`${s.base}/s/${c}`)).text(), /expired/);
  assert.equal((await fetch(`${s.base}/s/${"z".repeat(22)}`)).status, 404);
  assert.equal((await fetch(`${s.base}/s/short`)).status, 404);
  assert.equal((await s.admin("/v1/requests/nope/void", {})).status, 404);
  assert.equal((await s.admin("/v1/requests", { title: "x", body: "short" })).status, 400);
  s.close();
});

test("a signed request cannot be voided via the API; admin page and health work", async () => {
  const s = await boot();
  const tok = tokenOf((await s.create()).signUrl);
  await s.post(`/s/${tok}`, { action: "sign", name: "Ada L", consent: "on" });
  assert.equal((await s.admin(`/v1/requests/${tok}/void`, {})).status, 409);
  const adm = await (await fetch(`${s.base}/admin`)).text();
  assert.ok(!/innerHTML/.test(adm)); assert.match(adm, /type="password"/); assert.ok(!adm.includes("<b>"));
  assert.equal((await fetch(`${s.base}/healthz`)).status, 200);
  s.close();
});
