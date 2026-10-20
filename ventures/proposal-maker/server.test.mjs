import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler } from "./server.mjs";
import { newState } from "./sign.mjs";

const ADMIN = "admin-key-1234567890";
const HTML = "<!doctype html><html><head><title>PROP-9 Brand site</title></head><body><script>alert(1)</script>Total $4,000</body></html>";
async function boot(over = {}) {
  const sent = [], hooks = []; const state = newState(); let t = Date.parse("2026-10-15T12:00:00Z");
  const cfg = { state, save() {}, adminKey: ADMIN, baseUrl: "https://s.test", notifyEmail: "me@me.test", dryRun: false, send: async (m) => sent.push(m), webhookUrl: "https://hook.test/x", fetchImpl: async (u, o) => { hooks.push(JSON.parse(o.body)); return { ok: true }; }, now: () => (t += 1000), ...over };
  const srv = http.createServer(handler(cfg)); await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const admin = (p, init = {}) => fetch(base + p, { ...init, headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json", ...(init.headers || {}) } });
  const publish = async (extra = {}) => { const r = await admin("/v1/admin/docs", { method: "POST", body: JSON.stringify({ html: HTML, ...extra }) }); return { r, body: await r.json() }; };
  const form = (p, data, ip = "10.0.0.1") => fetch(base + p, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip }, body: new URLSearchParams(data) });
  return { srv, state, sent, hooks, admin, publish, form, base, get: (p, h = {}) => fetch(base + p, { redirect: "manual", headers: h }) };
}
const path = (u) => new URL(u).pathname;

test("admin API needs the key", async () => {
  const { srv, base } = await boot();
  assert.equal((await fetch(base + "/v1/admin/docs")).status, 401);
  assert.equal((await fetch(base + "/v1/admin/docs", { headers: { authorization: "Bearer wrong" } })).status, 401);
  srv.close();
});

test("publish, view, accept, certificate: the whole flow, with email and webhook", async () => {
  const { srv, sent, hooks, publish, get, form, admin } = await boot();
  const { r, body } = await publish({ clientEmail: "ann@x.test" });
  assert.equal(r.status, 201); assert.match(body.url, /^https:\/\/s\.test\/d\/[0-9a-f]{48}$/);
  const p = path(body.url);
  const landing = await (await get(p)).text();
  assert.match(landing, /Accept this proposal/); assert.match(landing, /sandbox/);
  const doc = await get(p + "/doc");
  assert.match(doc.headers.get("content-security-policy"), /^sandbox/);
  assert.equal(await doc.text(), HTML);
  assert.equal(sent.at(-1).subject.startsWith("Proposal opened"), true);
  const bad = await form(p + "/accept", { name: "Ann Lee" });
  assert.equal(bad.status, 400);
  const ok = await form(p + "/accept", { name: "Ann Lee", agree: "1" });
  assert.equal(ok.status, 303); assert.equal(ok.headers.get("location"), p + "/certificate");
  const cert = await (await get(p + "/certificate")).text();
  assert.match(cert, /Ann Lee/); assert.match(cert, new RegExp(body.sha256));
  assert.deepEqual(sent.map((m) => m.to), ["me@me.test", "me@me.test", "ann@x.test"]);
  assert.deepEqual(hooks.map((h) => h.event), ["opened", "accepted"]);
  const again = await form(p + "/accept", { name: "Bob Roe", agree: "1" });
  assert.equal(again.status, 409);
  const one = await (await admin("/v1/admin/docs/" + body.id)).json();
  assert.equal(one.status, "accepted"); assert.equal(one.html, undefined);
  assert.equal((await (await admin("/v1/admin/docs")).json()).stats.accepted, 1);
  srv.close();
});

test("decline records the reason; an expired link refuses to sign", async () => {
  const { srv, publish, get, form } = await boot();
  const a = path((await publish()).body.url);
  assert.equal((await form(a + "/decline", { reason: "budget" })).status, 303);
  assert.match(await (await get(a + "/certificate")).text(), /budget/);
  const b = path((await publish({ expires: "2026-10-14" })).body.url);
  const r = await form(b + "/accept", { name: "Ann Lee", agree: "1" });
  assert.equal(r.status, 410);
  assert.match(await (await get(b)).text(), /expired/);
  srv.close();
});

test("dry run sends nothing and still records the signature", async () => {
  const { srv, sent, hooks, publish, form, state } = await boot({ dryRun: true });
  const p = path((await publish()).body.url);
  await form(p + "/accept", { name: "Ann Lee", agree: "1" });
  assert.equal(sent.length + hooks.length, 0);
  assert.equal(Object.values(state.docs)[0].status, "accepted");
  srv.close();
});

test("a failing notification never undoes the signature", async () => {
  const { srv, publish, form, state } = await boot({ send: async () => { throw new Error("mail down"); } });
  const p = path((await publish()).body.url);
  const r = await form(p + "/accept", { name: "Ann Lee", agree: "1" });
  assert.equal(r.status, 303); assert.equal(Object.values(state.docs)[0].status, "accepted");
  srv.close();
});

test("unknown or malformed tokens 404 and accept is rate limited", async () => {
  const { srv, get, publish, form } = await boot({ allow: (() => { let n = 0; return () => ++n <= 2; })() });
  assert.equal((await get("/d/" + "0".repeat(48))).status, 404);
  assert.equal((await get("/d/short")).status, 404);
  const p = path((await publish()).body.url);
  await form(p + "/accept", { name: "A" }); await form(p + "/accept", { name: "A" });
  assert.equal((await form(p + "/accept", { name: "A" })).status, 429);
  srv.close();
});

test("the certificate escapes the signer's name and the admin page needs the key", async () => {
  const { srv, publish, form, get, base } = await boot();
  const p = path((await publish()).body.url);
  await form(p + "/accept", { name: "<img src=x onerror=alert(1)>", agree: "1" });
  const cert = await (await get(p + "/certificate")).text();
  assert.doesNotMatch(cert, /<img src=x/); assert.match(cert, /&lt;img/);
  assert.equal((await fetch(base + "/admin")).status, 401);
  const ok = await fetch(base + "/admin", { headers: { authorization: "Basic " + Buffer.from("u:" + ADMIN).toString("base64") } });
  assert.equal(ok.status, 200); assert.match(await ok.text(), /Send a proposal for signature/);
  srv.close();
});
