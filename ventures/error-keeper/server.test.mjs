import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, alertFor, webhookSender, loadState } from "./server.mjs";
import * as E from "./engine.mjs";
import { createKeeper } from "./sdk.mjs";
import { createHmac } from "node:crypto";

const ING = "ingest-key-0123456789", ADM = "admin-key-0123456789ab";
async function boot(extra = {}) {
  const state = E.newState(), alerts = []; let t = Date.UTC(2026, 9, 16, 12), saves = 0;
  const cfg = { state, save: () => saves++, ingestKey: ING, adminKey: ADM, allowedOrigins: [], send: async (a) => { alerts.push(a); }, now: () => t, dashboard: "<h1>dash</h1>", sdk: { js: "//js", mjs: "//mjs" }, ...extra };
  const server = http.createServer(handler(cfg)); await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { method = "GET", key, body, headers = {} } = {}) => fetch(base + path, { method, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.text().then((x) => { try { return JSON.parse(x); } catch { return x; } }), headers: r.headers }));
  return { state, alerts, call, base, tick: (ms) => { t += ms; }, saves: () => saves, close: () => server.close() };
}
const evt = (o = {}) => ({ type: "TypeError", message: "boom 1", stack: "TypeError: boom\n    at render (/srv/app.js:1:1)", release: "1.0.0", ...o });

test("ingest needs the ingest key; the admin key also works; reads need the admin key", async () => {
  const s = await boot();
  assert.equal((await s.call("/v1/events", { method: "POST", body: evt() })).status, 401);
  assert.equal((await s.call("/v1/events", { method: "POST", key: "wrong-key-0000000000", body: evt() })).status, 401);
  assert.equal((await s.call("/v1/events", { method: "POST", key: ING, body: evt() })).status, 202);
  assert.equal((await s.call("/v1/issues", { key: ING })).status, 401);
  assert.equal((await s.call("/v1/issues", { key: ADM })).body.issues.length, 1);
  s.close();
});

test("the first event of a group alerts once, repeats do not", async () => {
  const s = await boot();
  for (let k = 0; k < 3; k++) await s.call("/v1/events", { method: "POST", key: ING, body: evt({ message: `boom ${k}` }) });
  assert.equal(s.alerts.length, 1); assert.equal(s.alerts[0].type, "issue.new"); assert.match(s.alerts[0].text, /New error in default/);
  s.close();
});

test("resolve then recur alerts a regression; a spike alerts once per hour", async () => {
  const s = await boot();
  const r = await s.call("/v1/events", { method: "POST", key: ING, body: evt() }); const id = r.body.results[0].issue;
  assert.equal((await s.call(`/v1/issues/${id}/resolve`, { method: "POST", key: ADM, body: { release: "1.0.0" } })).body.status, "resolved");
  await s.call("/v1/events", { method: "POST", key: ING, body: evt() });
  assert.deepEqual(s.alerts.map((a) => a.type), ["issue.new", "issue.regressed"]);
  s.tick(2 * E.HOUR);
  for (let k = 0; k < 15; k++) await s.call("/v1/events", { method: "POST", key: ING, body: evt() });
  assert.deepEqual(s.alerts.map((a) => a.type), ["issue.new", "issue.regressed", "issue.spike"]);
  s.close();
});

test("a failed alert is retried on the next event for the issue, then not repeated", async () => {
  let fail = true; const sent = [];
  const s = await boot({ send: async (a) => { if (fail) throw new Error("down"); sent.push(a.type); } });
  await s.call("/v1/events", { method: "POST", key: ING, body: evt() }); await new Promise((r) => setTimeout(r, 20));
  fail = false; s.tick(1000);
  await s.call("/v1/events", { method: "POST", key: ING, body: evt({ message: "boom 9" }) }); await new Promise((r) => setTimeout(r, 20));
  await s.call("/v1/events", { method: "POST", key: ING, body: evt({ message: "boom 10" }) }); await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(sent, ["issue.new"]); s.close();
});

test("a second regression of the same issue alerts again", async () => {
  const s = await boot();
  const id = (await s.call("/v1/events", { method: "POST", key: ING, body: evt() })).body.results[0].issue;
  for (let k = 0; k < 2; k++) {
    s.tick(1000); await s.call(`/v1/issues/${id}/resolve`, { method: "POST", key: ADM, body: {} });
    s.tick(1000); await s.call("/v1/events", { method: "POST", key: ING, body: evt() });
  }
  assert.deepEqual(s.alerts.map((a) => a.type), ["issue.new", "issue.regressed", "issue.regressed"]);
  s.close();
});

test("origin allow-list blocks other sites and sets CORS for the allowed one", async () => {
  const s = await boot({ allowedOrigins: ["https://app.example.com"] });
  const bad = await s.call("/v1/events", { method: "POST", key: ING, body: evt(), headers: { origin: "https://evil.example" } });
  assert.equal(bad.status, 403);
  const ok = await s.call("/v1/events", { method: "POST", key: ING, body: evt(), headers: { origin: "https://app.example.com" } });
  assert.equal(ok.status, 202); assert.equal(ok.headers.get("access-control-allow-origin"), "https://app.example.com");
  const pre = await s.call("/v1/events", { method: "OPTIONS", headers: { origin: "https://app.example.com" } });
  assert.equal(pre.status, 204);
  s.close();
});

test("a per-minute cap protects the disk during a crash loop", async () => {
  const s = await boot({ perMinute: 3 });
  const codes = []; for (let k = 0; k < 5; k++) codes.push((await s.call("/v1/events", { method: "POST", key: ING, body: evt() })).status);
  assert.deepEqual(codes, [202, 202, 202, 429, 429]);
  s.tick(61_000); assert.equal((await s.call("/v1/events", { method: "POST", key: ING, body: evt() })).status, 202);
  s.close();
});

test("batches, bad JSON and empty events are handled", async () => {
  const s = await boot();
  const b = await s.call("/v1/events", { method: "POST", key: ING, body: { events: [evt(), {}] } });
  assert.equal(b.status, 202); assert.deepEqual(b.body.results.map((r) => r.status), ["new", "rejected"]);
  assert.equal((await s.call("/v1/events", { method: "POST", key: ING, body: {} })).status, 400);
  const raw = await fetch(s.base + "/v1/events", { method: "POST", headers: { authorization: `Bearer ${ING}` }, body: "{nope" });
  assert.equal(raw.status, 400);
  s.close();
});

test("issue detail hides user hashes; unknown issue is 404; dashboard and sdk are served", async () => {
  const s = await boot();
  const id = (await s.call("/v1/events", { method: "POST", key: ING, body: evt({ user: "u1" }) })).body.results[0].issue;
  const d = await s.call(`/v1/issues/${id}`, { key: ADM }); assert.equal(d.status, 200); assert.equal(d.body.users, undefined); assert.equal(d.body.userCount, 1);
  assert.equal((await s.call("/v1/issues/deadbeef", { key: ADM })).status, 404);
  assert.match((await s.call("/")).body, /dash/); assert.equal((await s.call("/sdk.js")).body, "//js");
  assert.equal((await s.call("/v1/releases", { key: ADM })).body.releases[0].release, "1.0.0");
  s.close();
});

test("alert signature is HMAC of the body and carries chat-ready text", async () => {
  let seen;
  const send = webhookSender({ url: "http://x/h", secret: "s3cret", fetchImpl: async (u, o) => { seen = o; return { ok: true }; } });
  await send(alertFor("new", { id: "ab", project: "web", type: "Error", title: "t", count: 1, userCount: 0 }));
  assert.equal(seen.headers["x-keeper-signature"], "sha256=" + createHmac("sha256", "s3cret").update(seen.body).digest("hex"));
  assert.match(JSON.parse(seen.body).content, /New error in web/);
});

test("the node SDK posts the stack and release and swallows failures", async () => {
  let got;
  const k = createKeeper({ url: "http://k/", key: "kk", release: "2.0.0", project: "api", fetchImpl: async (u, o) => { got = { u, o }; return { ok: true }; } });
  await k.capture(new TypeError("bad"), { user: "u1" });
  const b = JSON.parse(got.o.body); assert.equal(got.u, "http://k/v1/events"); assert.equal(b.type, "TypeError"); assert.equal(b.release, "2.0.0"); assert.match(b.stack, /TypeError: bad/);
  const errs = []; const bad = createKeeper({ url: "http://k", key: "kk", fetchImpl: async () => { throw new Error("net"); }, onError: (e) => errs.push(e.message) });
  await bad.capture("plain string"); assert.deepEqual(errs, ["net"]);
});

test("express middleware reports and forwards the error", async () => {
  const posted = []; const k = createKeeper({ url: "http://k", key: "kk", fetchImpl: async (u, o) => { posted.push(JSON.parse(o.body)); return { ok: true }; } });
  let passed; k.middleware()(new Error("x"), { path: "/pay", method: "POST" }, {}, (e) => { passed = e; });
  assert.equal(passed.message, "x"); assert.equal(posted[0].tags.route, "/pay");
});

test("loadState survives a missing file", () => { assert.deepEqual(Object.keys(loadState("/nonexistent/x.json")).sort(), ["alerted", "issues", "seen"]); });
