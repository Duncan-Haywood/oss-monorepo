import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import * as E from "./engine.mjs";
import { handler, runTick, unsubToken, unsubEmail, resendSender } from "./server.mjs";

const H = 3_600_000, ADMIN = "a".repeat(20), SECRET = "s".repeat(20);
const SEQ = [{ id: "onboard", trigger: "signed_up", exitOn: ["upgraded"], steps: [{ subject: "Hi {{name|there}}", text: "Welcome." }, { waitHours: 24, subject: "Two", text: "Second." }] }];

async function boot(over = {}) {
  const clock = { t: Date.UTC(2026, 0, 5, 9) };
  const cfg = { state: E.newState(), save() {}, adminKey: ADMIN, secret: SECRET, base: "https://mail.test", product: "Acme", address: "1 Main St", dryRun: false, now: () => clock.t, ...over };
  cfg.state.sequences = E.validateSequences(SEQ);
  const srv = http.createServer(handler(cfg)); await new Promise((r) => srv.listen(0, r));
  const call = async (method, path, body, key = ADMIN, headers = {}) => {
    const r = await fetch(`http://127.0.0.1:${srv.address().port}${path}`, { method, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body && typeof body !== "string" ? { "content-type": "application/json" } : {}), ...headers }, body: body && (typeof body === "string" ? body : JSON.stringify(body)) });
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch {}
    return { status: r.status, text, json: j };
  };
  return { cfg, clock, call, close: () => { srv.closeAllConnections(); srv.close(); } };
}

test("events need a key; a good one enrolls the contact", async () => {
  const s = await boot();
  assert.equal((await s.call("POST", "/v1/events", { email: "a@x.io", event: "signed_up" }, null)).status, 401);
  assert.equal((await s.call("POST", "/v1/events", { email: "a@x.io", event: "signed_up" }, "wrong")).status, 401);
  const r = await s.call("POST", "/v1/events", { email: "A@x.io", event: "signed_up", name: "Ada" });
  assert.deepEqual(r.json.enrolled, ["onboard"]);
  assert.equal((await s.call("POST", "/v1/events", { email: "bad", event: "signed_up" })).status, 400);
  assert.equal((await s.call("POST", "/v1/events", "{nope")).status, 400);
  s.close();
});

test("a separate ingest key can post events but cannot reach admin", async () => {
  const s = await boot({ ingestKey: "i".repeat(20) });
  assert.equal((await s.call("POST", "/v1/events", { email: "a@x.io", event: "signed_up" }, "i".repeat(20))).status, 200);
  assert.equal((await s.call("GET", "/v1/admin/stats", null, "i".repeat(20))).status, 401);
  s.close();
});

test("tick sends the due email with unsubscribe headers, once, then the next on schedule", async () => {
  const sent = [], s = await boot({ send: async (m) => sent.push(m) });
  await s.call("POST", "/v1/events", { email: "a@x.io", event: "signed_up", name: "Ada" });
  let r = await runTick(s.cfg);
  assert.equal(r.sent, 1); assert.equal(sent[0].subject, "Hi Ada");
  assert.match(sent[0].headers["List-Unsubscribe"], /^<https:\/\/mail\.test\/u\//);
  assert.equal(sent[0].headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(sent[0].text, /1 Main St/);
  assert.equal((await runTick(s.cfg)).sent, 0);
  s.clock.t += 24 * H; assert.equal((await runTick(s.cfg)).sent, 1);
  assert.equal(sent[1].subject, "Two");
  s.close();
});

test("dry run reports what would send and changes nothing", async () => {
  const sent = [], s = await boot({ dryRun: true, send: async (m) => sent.push(m) });
  await s.call("POST", "/v1/events", { email: "a@x.io", event: "signed_up" });
  const r = await s.call("POST", "/v1/admin/tick");
  assert.equal(r.json.dryRun, true); assert.equal(r.json.due, 1); assert.equal(sent.length, 0);
  assert.equal((await s.call("POST", "/v1/admin/tick")).json.due, 1, "still due: nothing advanced");
  s.close();
});

test("a provider failure keeps the step due and gives up after four tries without blocking the next step", async () => {
  let fail = true; const sent = [];
  const s = await boot({ send: async (m) => { if (fail) throw new Error("boom"); sent.push(m); } });
  await s.call("POST", "/v1/events", { email: "a@x.io", event: "signed_up" });
  assert.equal((await runTick(s.cfg)).failed, 1);
  assert.equal(s.cfg.state.contacts["a@x.io"].en.onboard.i, 0);
  fail = false; s.clock.t += 30 * 60_000; assert.equal((await runTick(s.cfg)).sent, 1, "retried after backoff");
  fail = true; await s.call("POST", "/v1/events", { email: "b@x.io", event: "signed_up" });
  for (let n = 0; n < 4; n++) { await runTick(s.cfg); s.clock.t += 24 * H; }
  assert.equal(s.cfg.state.contacts["b@x.io"].en.onboard.sent[0].failed, true);
  s.close();
});

test("the unsubscribe link works from a GET page and a one-click POST, and cannot be forged", async () => {
  const s = await boot({ send: async () => {} });
  await s.call("POST", "/v1/events", { email: "a@x.io", event: "signed_up" });
  const tok = unsubToken(SECRET, "a@x.io");
  assert.equal(unsubEmail(SECRET, tok), "a@x.io");
  assert.equal(unsubEmail(SECRET, unsubToken("other-secret", "a@x.io")), null);
  assert.equal(unsubEmail(SECRET, `${Buffer.from("b@x.io").toString("base64url")}.${tok.split(".")[1]}`), null);
  const page = await s.call("GET", `/u/${tok}`, null, null);
  assert.match(page.text, /Unsubscribe\?/); assert.equal(s.cfg.state.contacts["a@x.io"].unsub, null, "GET alone changes nothing");
  assert.equal((await s.call("POST", `/u/${tok}`, "List-Unsubscribe=One-Click", null, { "content-type": "application/x-www-form-urlencoded" })).status, 200);
  assert.ok(s.cfg.state.contacts["a@x.io"].unsub);
  assert.equal((await runTick(s.cfg)).due, 0);
  assert.equal((await s.call("GET", "/u/garbage.token", null, null)).status, 400);
  s.close();
});

test("admin: replace sequences, read a contact, suppress, erase, export", async () => {
  const s = await boot();
  assert.equal((await s.call("PUT", "/v1/admin/sequences", [{ id: "x" }])).status, 400);
  assert.equal((await s.call("PUT", "/v1/admin/sequences", SEQ)).json.sequences, 1);
  await s.call("POST", "/v1/events", { email: "a@x.io", event: "signed_up" });
  assert.equal((await s.call("GET", "/v1/admin/contacts/a%40x.io")).json.email, "a@x.io");
  assert.equal((await s.call("POST", "/v1/admin/suppress", { email: "a@x.io", reason: "bounce" })).json.suppressed, true);
  assert.match((await s.call("GET", "/v1/admin/export.csv")).text, /a@x\.io/);
  assert.equal((await s.call("GET", "/v1/admin/stats")).json.suppressed, 1);
  assert.equal((await s.call("DELETE", "/v1/admin/contacts/a%40x.io")).json.erased, true);
  assert.equal((await s.call("GET", "/v1/admin/contacts/a%40x.io")).status, 404);
  assert.equal((await s.call("GET", "/v1/admin/stats", null, null)).status, 401);
  s.close();
});

test("rate limit answers 429 and healthz is open", async () => {
  const s = await boot({ allow: (() => { let n = 0; return () => ++n <= 1; })() });
  assert.equal((await s.call("GET", "/healthz", null, null)).status, 200);
  await s.call("GET", "/nothing", null, null);
  assert.equal((await s.call("GET", "/nothing", null, null)).status, 429);
  s.close();
});

test("resendSender posts the message including headers to Resend", async () => {
  let seen; const send = resendSender({ apiKey: "k", from: "A <a@x.io>", fetchImpl: async (u, o) => { seen = { u, o }; return { ok: true }; } });
  await send({ to: "b@x.io", subject: "s", text: "t", html: "<p>t</p>", headers: { "List-Unsubscribe": "<u>" } });
  assert.equal(seen.u, "https://api.resend.com/emails");
  assert.equal(JSON.parse(seen.o.body).headers["List-Unsubscribe"], "<u>");
  await assert.rejects(resendSender({ apiKey: "k", from: "f", fetchImpl: async () => ({ ok: false, status: 429 }) })({ to: "b@x.io" }), /429/);
});
