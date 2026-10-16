import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, upload } from "./import.mjs";

const EVENTS = "account,date,type\nann,2026-09-01,login\nann,2026-09-01,login\nann,2026-09-03,invite\nbob,2026-09-02,login\n";

test("plan makes stable, unique event ids and one conversion per paying account", () => {
  const a = plan(EVENTS, "ann,2026-09-10"), b = plan(EVENTS, "ann,2026-09-10");
  assert.equal(a.events.length, 4);
  assert.equal(new Set(a.events.map((e) => e.id)).size, 4);
  assert.deepEqual(a.events.map((e) => e.id), b.events.map((e) => e.id));
  assert.deepEqual(a.conversions, [{ account: "ann", convertedAt: Date.parse("2026-09-10") }]);
  assert.ok(a.events.every((e) => e.signup === Date.parse(e.account === "ann" ? "2026-09-01" : "2026-09-02")));
});

test("upload batches events and posts each conversion", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { const body = JSON.parse(init.body); calls.push([url, body]); return { ok: true, status: 200, json: async () => ({ results: (body.events || []).map(() => ({ status: "accepted" })) }) }; };
  const p = plan(EVENTS, "ann,2026-09-10");
  const t = await upload({ url: "http://x/", key: "k", events: p.events, conversions: p.conversions, fetchImpl });
  assert.equal(t.accepted, 4); assert.equal(t.conversions, 1);
  assert.deepEqual(calls.map((c) => c[0]), ["http://x/v1/events", "http://x/v1/conversions"]);
});
