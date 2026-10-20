import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createMeter } from "./sdk.mjs";
import { handler } from "./server.mjs";
import { newState, setCustomer } from "./engine.mjs";

const KEY = "api-key-1234567890";
const config = { meters: { api: { agg: "sum" } }, plans: { pro: { lines: [{ meter: "api", model: "flat", unit: 1, limit: 5 }] } } };
async function boot() {
  const state = newState(); setCustomer(state, "acme", { plan: "pro" });
  const srv = http.createServer(handler({ state, save() {}, config, apiKey: KEY, adminKey: "x".repeat(16), dryRun: true, now: () => Date.UTC(2026, 9, 15, 12), sdk: "// sdk" }));
  await new Promise((r) => srv.listen(0, r));
  return { srv, url: `http://127.0.0.1:${srv.address().port}` };
}

test("tracked events are batched, counted once, and check enforces the limit", async () => {
  const { srv, url } = await boot();
  const errors = [], m = createMeter({ url, key: KEY, onError: (e) => errors.push(e.message) });
  m.track("acme", "api", 3); m.track("acme", "api", 2);
  await m.close();
  assert.deepEqual(errors, []);
  assert.equal((await m.usage("acme")).usage.api, 5);
  assert.equal((await m.check("acme", "api", 1)).allowed, false);
  assert.equal((await m.check("acme", "api", 0)).allowed, true);
  assert.equal((await m.invoicePreview("acme")).customer ?? "acme", "acme");
  srv.close();
});

test("a batch resent after a lost response is not double counted", async () => {
  const { srv, url } = await boot();
  let calls = 0;
  const lossy = async (u, o) => { const r = await fetch(u, o); if (o?.method === "POST" && ++calls === 1) throw new Error("connection reset"); return r; };
  const m = createMeter({ url, key: KEY, fetchImpl: lossy, backoffMs: 1 });
  m.track("acme", "api", 4); await m.close();
  assert.equal(calls, 2);
  assert.equal((await m.usage("acme")).usage.api, 4);
  srv.close();
});

test("an unreachable server never throws: events drop with an error, checks fail open", async () => {
  const errors = [], m = createMeter({ url: "http://127.0.0.1:1", key: KEY, retries: 1, backoffMs: 1, onError: (e) => errors.push(e.message) });
  m.track("acme", "api"); await m.close();
  assert.match(errors[0], /dropped 1 event/);
  assert.deepEqual(await m.check("acme", "api"), { allowed: true, reason: "meter_unreachable" });
});

test("the server hands out the SDK without a key", async () => {
  const { srv, url } = await boot();
  const r = await fetch(url + "/sdk.mjs"); assert.equal(r.status, 200); assert.equal(await r.text(), "// sdk");
  srv.close();
});
