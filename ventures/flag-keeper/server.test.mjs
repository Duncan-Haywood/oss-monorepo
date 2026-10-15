import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { handler, newState, loadState } from "./server.mjs";
import { createClient } from "./sdk.mjs";

const ADMIN = "admin-key-1234567890", SERVER = "server-key-1234567890", CLIENT = "client-key-1234567890";
const seed = JSON.parse(readFileSync(new URL("./examples/flags.json", import.meta.url), "utf8"));
async function boot(over = {}) {
  const state = loadState("/nonexistent/x.json", seed); let saves = 0, t = Date.parse("2026-10-15T12:00:00Z");
  const h = handler({ state, save: () => saves++, adminKey: ADMIN, serverKey: SERVER, clientKey: CLIENT, now: () => (t += 1000), assets: { "/engine.mjs": "export {}" }, ...over });
  const srv = http.createServer(h); await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = (method, path, body, key = ADMIN, headers = {}) => fetch(base + path, { method, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { srv, state, call, base, h, saves: () => saves };
}

test("keys: each key reaches only what it should", async () => {
  const { srv, call } = await boot();
  assert.equal((await call("POST", "/v1/evaluate", { flag: "kill-switch-exports", context: { key: "u" } }, null)).status, 401);
  assert.equal((await call("POST", "/v1/evaluate", { flag: "kill-switch-exports", context: { key: "u" } }, CLIENT)).status, 200);
  assert.equal((await call("GET", "/v1/config", undefined, CLIENT)).status, 401); // a key shipped in an app cannot read rules
  assert.equal((await call("GET", "/v1/admin/config", undefined, SERVER)).status, 401);
  assert.equal((await call("PUT", "/v1/admin/flags/x", {}, CLIENT)).status, 401);
  assert.equal((await call("GET", "/v1/config", undefined, SERVER)).status, 200);
  assert.equal((await fetch(`${srv.address() && "http://127.0.0.1:" + srv.address().port}/healthz`)).status, 200);
  srv.close(); srv.closeAllConnections();
});

test("evaluate: needs a context key, reports reason, 404s an unknown flag, honours rules and prerequisites", async () => {
  const { srv, call } = await boot();
  const ev = async (flag, context) => { const r = await call("POST", "/v1/evaluate", { flag, context }, CLIENT); return { s: r.status, b: await r.json() }; };
  assert.equal((await call("POST", "/v1/evaluate", { flag: "new-checkout", context: {} }, CLIENT)).status, 400);
  assert.equal((await ev("ghost", { key: "u" })).s, 404);
  const staff = await ev("new-checkout", { key: "x", email: "a@example.com" });
  assert.deepEqual([staff.b.variant, staff.b.reason, staff.b.ruleId], ["on", "rule", "staff"]);
  assert.equal((await ev("new-checkout", { key: "x", email: "a@other.com", appVersion: "3.1.9" })).b.variant, "off");
  assert.equal((await ev("ai-summaries", { key: "y", plan: "pro", email: "a@other.com", appVersion: "3.1.0" })).b.reason, "prerequisite_failed");
  assert.equal((await ev("ai-summaries", { key: "y", plan: "pro", email: "a@example.com" })).b.variant, "on");
  const all = await (await call("POST", "/v1/evaluate-all", { context: { key: "u", email: "a@example.com" } }, CLIENT)).json();
  assert.deepEqual(Object.keys(all.flags).sort(), ["ai-summaries", "kill-switch-exports", "new-checkout", "pricing-page-test"]);
  const stats = await (await call("GET", "/v1/admin/stats")).json();
  assert.ok(stats.evaluations["new-checkout"].on >= 1);
  srv.close(); srv.closeAllConnections();
});

test("admin: create, toggle, update with audit, and invalid edits are refused without changing anything", async () => {
  const { srv, call, state, saves } = await boot();
  const v0 = state.version;
  const bad = await call("PUT", "/v1/admin/flags/beta-banner", { enabled: true, fallthrough: { rollout: [{ variant: "on", weight: 70 }, { variant: "off", weight: 20 }] } });
  assert.equal(bad.status, 400); assert.match((await bad.json()).error, /sum to 90/);
  assert.equal(state.version, v0); assert.equal(state.flags["beta-banner"], undefined);
  const ok = await call("PUT", "/v1/admin/flags/beta-banner", { enabled: true, fallthrough: { variant: "on" } }, ADMIN, { "x-actor": "ada@example.com" });
  assert.equal(ok.status, 200); assert.equal(state.version, v0 + 1);
  const t = await (await call("POST", "/v1/admin/flags/beta-banner/toggle", {}, ADMIN, { "x-actor": "ada@example.com" })).json();
  assert.equal(t.enabled, false);
  assert.equal((await (await call("POST", "/v1/evaluate", { flag: "beta-banner", context: { key: "u" } }, CLIENT)).json()).reason, "off");
  const audit = (await (await call("GET", "/v1/admin/audit")).json()).audit;
  assert.deepEqual(audit.slice(0, 2).map((a) => [a.action, a.actor, a.target]), [["disable-flag", "ada@example.com", "beta-banner"], ["create-flag", "ada@example.com", "beta-banner"]]);
  assert.deepEqual(audit[0].before, { enabled: true }); assert.deepEqual(audit[0].after, { enabled: false });
  assert.ok(saves() >= 2);
  srv.close(); srv.closeAllConnections();
});

test("deleting a flag or segment that something else needs is refused", async () => {
  const { srv, call, state } = await boot();
  const d = await call("DELETE", "/v1/admin/flags/new-checkout"); assert.equal(d.status, 409); assert.match((await d.json()).error, /prerequisite of ai-summaries/);
  const s = await call("DELETE", "/v1/admin/segments/internal"); assert.equal(s.status, 400); assert.match((await s.json()).error, /segment "internal" does not exist/);
  assert.ok(state.segments.internal && state.flags["new-checkout"]);
  assert.equal((await call("DELETE", "/v1/admin/flags/ai-summaries")).status, 200);
  assert.equal((await call("DELETE", "/v1/admin/flags/new-checkout")).status, 200);
  assert.equal((await call("DELETE", "/v1/admin/segments/internal")).status, 200);
  srv.close(); srv.closeAllConnections();
});

test("impact shows who flips before you save a rollout change", async () => {
  const { srv, call, state } = await boot();
  const wider = { ...state.flags["new-checkout"], fallthrough: { rollout: [{ variant: "on", weight: 30 }, { variant: "off", weight: 70 }] } };
  const r = await (await call("POST", "/v1/admin/impact", { flag: "new-checkout", proposed: wider, users: 5000, attrs: { email: "x@other.com" } })).json();
  assert.deepEqual(Object.keys(r.moves), ["off -> on"]);
  assert.ok(Math.abs(r.changed / 5000 - 0.2) < 0.03, String(r.changed));
  assert.equal(state.flags["new-checkout"].fallthrough.rollout[0].weight, 10); // nothing saved
  srv.close(); srv.closeAllConnections();
});

test("replace-config accepts flags-as-code and refuses a broken file whole", async () => {
  const { srv, call, state } = await boot();
  const broken = { flags: { a: { enabled: true, fallthrough: { variant: "maybe" } } } };
  assert.equal((await call("PUT", "/v1/admin/config", broken)).status, 400);
  assert.ok(state.flags["new-checkout"]);
  const good = { salt: "s2", flags: { a: { enabled: true, fallthrough: { variant: "on" } } } };
  assert.equal((await call("PUT", "/v1/admin/config", good)).status, 200);
  assert.deepEqual(Object.keys(state.flags), ["a"]); assert.equal(state.salt, "s2");
  srv.close(); srv.closeAllConnections();
});

test("config endpoint supports ETag so SDKs poll cheaply, and the local SDK evaluates like the server", async () => {
  const { srv, call, base } = await boot();
  const first = await call("GET", "/v1/config", undefined, SERVER); const tag = first.headers.get("etag");
  assert.equal((await call("GET", "/v1/config", undefined, SERVER, { "if-none-match": tag })).status, 304);
  const local = createClient({ url: base, key: SERVER, mode: "local" }); await local.ready();
  const remote = createClient({ url: base, key: CLIENT });
  for (const ctx of [{ key: "u1", email: "a@example.com" }, { key: "u2", appVersion: "3.0.0" }, { key: "u3", plan: "pro" }, { key: "u4", account: "acme" }]) {
    for (const f of ["new-checkout", "ai-summaries", "pricing-page-test"]) {
      const a = await local.detail(f, ctx), b = await remote.detail(f, ctx);
      assert.deepEqual([a.variant, a.reason], [b.variant, b.reason], `${f} ${JSON.stringify(ctx)}`);
    }
  }
  assert.equal(await remote.isOn("kill-switch-exports", { key: "u" }), true);
  assert.equal(await remote.value("nope", { key: "u" }, "fallback"), "fallback");
  await call("POST", "/v1/admin/flags/kill-switch-exports/toggle", { enabled: false });
  assert.equal(await local.isOn("kill-switch-exports", { key: "u" }), true); // not yet refreshed
  assert.equal(await local.refresh(), true);
  assert.equal(await local.isOn("kill-switch-exports", { key: "u" }), false);
  assert.equal(await local.refresh(), false); // 304
  local.close(); srv.close(); srv.closeAllConnections();
});

test("an unreachable server yields the fallback, never a thrown error", async () => {
  const errs = []; const c = createClient({ url: "http://127.0.0.1:1", key: CLIENT, onError: (e) => errs.push(e) });
  assert.equal(await c.isOn("x", { key: "u" }), false); assert.equal(await c.value("x", { key: "u" }, 7), 7); assert.ok(errs.length);
  const l = createClient({ url: "http://127.0.0.1:1", key: SERVER, mode: "local" }); assert.equal(await l.value("x", { key: "u" }, "d"), "d");
});

test("change stream announces new versions", async () => {
  const { srv, call, base } = await boot();
  const r = await fetch(`${base}/v1/stream`, { headers: { authorization: `Bearer ${SERVER}` } });
  const reader = r.body.getReader(); const dec = new TextDecoder();
  assert.match(dec.decode((await reader.read()).value), /event: config/);
  await call("POST", "/v1/admin/flags/kill-switch-exports/toggle", {});
  assert.match(dec.decode((await reader.read()).value), /"version":\d+/);
  await reader.cancel(); srv.close(); srv.closeAllConnections(); srv.closeAllConnections?.();
});

test("rate limit applies to evaluation; CORS is open for the client key; assets are served", async () => {
  const { srv, call, base } = await boot({ allow: (() => { let n = 0; return () => ++n <= 2; })() });
  for (let i = 0; i < 2; i++) assert.equal((await call("POST", "/v1/evaluate", { flag: "kill-switch-exports", context: { key: "u" } }, CLIENT)).status, 200);
  assert.equal((await call("POST", "/v1/evaluate", { flag: "kill-switch-exports", context: { key: "u" } }, CLIENT)).status, 429);
  const pre = await fetch(base + "/v1/evaluate", { method: "OPTIONS" }); assert.equal(pre.status, 204); assert.equal(pre.headers.get("access-control-allow-origin"), "*");
  assert.equal((await fetch(base + "/engine.mjs")).status, 200);
  assert.equal((await call("POST", "/v1/evaluate", "{not json", CLIENT)).status, 429); // limiter is spent, so this is refused before parsing
  srv.close(); srv.closeAllConnections();
});

test("bad JSON and a missing flag name are 400s, not crashes", async () => {
  const { srv, base } = await boot();
  const raw = (body) => fetch(base + "/v1/evaluate", { method: "POST", headers: { authorization: `Bearer ${CLIENT}` }, body });
  assert.equal((await raw("{not json")).status, 400);
  assert.equal((await raw(JSON.stringify({ context: { key: "u" } }))).status, 400);
  srv.close(); srv.closeAllConnections();
});

test("loadState: seeds from a file once, then the state file wins; an invalid seed refuses to start", () => {
  assert.throws(() => loadState("/nonexistent/x.json", { flags: { a: { enabled: true, fallthrough: { variant: "zzz" } } } }), /FLAGS_FILE is invalid/);
  assert.deepEqual(Object.keys(loadState("/nonexistent/x.json", seed).flags).length, 4);
  assert.equal(newState().version, 1);
});
