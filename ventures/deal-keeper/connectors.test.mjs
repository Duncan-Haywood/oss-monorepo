import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { fromPipedrive, fromHubspot, toIso, stageMapFromEnv } from "./connectors.mjs";
import { handler } from "./server.mjs";
import * as E from "./engine.mjs";

const NOW = Date.UTC(2026, 9, 15, 12), KEY = "api-key-1234567890";
const STAGES = { "7": "qualified", "8": "proposal" };

test("toIso reads Pipedrive UTC strings, epoch ms and ISO", () => {
  assert.equal(toIso("2026-01-02 10:00:00"), "2026-01-02T10:00:00Z");
  assert.equal(toIso(String(Date.UTC(2026, 0, 2))), "2026-01-02T00:00:00.000Z");
  assert.equal(toIso(""), undefined);
});

test("Pipedrive v1 and v2 payloads map to the same deal", () => {
  const cur = { id: 5, title: "Acme", value: 1200, stage_id: 7, status: "open", add_time: "2026-09-01 08:00:00", expected_close_date: "2026-11-01", last_activity_date: "2026-10-10" };
  const v1 = fromPipedrive({ event: "updated.deal", current: cur }, STAGES);
  const v2 = fromPipedrive({ meta: { object: "deal", action: "change" }, data: cur }, STAGES);
  assert.deepEqual(v1, v2);
  assert.deepEqual(v1.deal, { id: "pd-5", name: "Acme", amount: 1200, stage: "qualified", status: "open", createdAt: "2026-09-01T08:00:00Z", closeDate: "2026-11-01", lastActivityAt: "2026-10-10" });
});

test("Pipedrive won, deleted, unmapped stage and other objects", () => {
  const won = fromPipedrive({ event: "updated.deal", current: { id: 5, status: "won", stage_id: 8, close_time: "2026-10-01 09:00:00" } }, STAGES);
  assert.equal(won.deal.status, "won"); assert.equal(won.deal.closedAt, "2026-10-01T09:00:00Z");
  assert.deepEqual(fromPipedrive({ event: "deleted.deal", previous: { id: 5 } }), { remove: "pd-5" });
  const unmapped = fromPipedrive({ event: "added.deal", current: { id: 6, stage_id: 99 } }, STAGES);
  assert.equal(unmapped.deal.stage, undefined); assert.match(unmapped.warning, /PIPEDRIVE_STAGES/);
  assert.ok(fromPipedrive({ event: "updated.person", current: { id: 1 } }).skip);
});

test("HubSpot flat, legacy-wrapped and closed-lost payloads", () => {
  const flat = fromHubspot({ hs_object_id: "42", dealname: "Beta", amount: "900", dealstage: "contractsent", closedate: "2026-12-01T00:00:00Z", hs_is_closed: "false" }, { contractsent: "proposal" });
  assert.deepEqual(flat.deal, { id: "hs-42", name: "Beta", amount: 900, stage: "proposal", closeDate: "2026-12-01T00:00:00Z" });
  const legacy = fromHubspot({ properties: { hs_object_id: { value: "42" }, dealname: { value: "Beta" } } });
  assert.equal(legacy.deal.name, "Beta");
  const lost = fromHubspot({ hs_object_id: 42, hs_is_closed: "true", hs_is_closed_won: "false", closedate: "2026-10-02T00:00:00Z" });
  assert.equal(lost.deal.status, "lost");
  assert.ok(fromHubspot({ dealname: "x" }).skip);
});

test("stageMapFromEnv lowercases, and bad JSON fails loudly", () => {
  assert.deepEqual(stageMapFromEnv({ X: '{"A":"Lead"}' }, "X"), { a: "lead" });
  assert.deepEqual(stageMapFromEnv({}, "X"), {});
  assert.throws(() => stageMapFromEnv({ X: "nope" }, "X"), /JSON/);
});

async function boot() {
  const state = E.newState();
  const cfg = { state, save() {}, apiKey: KEY, adminKey: "admin-key-1234567890", now: () => NOW, stageMaps: { pipedrive: { "7": "qualified" }, hubspot: {} } };
  const srv = http.createServer(handler(cfg)); await new Promise((r) => srv.listen(0, r));
  return { srv, state, base: `http://127.0.0.1:${srv.address().port}` };
}
const post = (url, body, headers = {}) => fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("webhook endpoint: auth by Basic password, ?key= or bearer; upserts, moves stage, deletes", async () => {
  const { srv, state, base } = await boot();
  const ev = { event: "added.deal", current: { id: 5, title: "Acme", value: 500, stage_id: 7, add_time: "2026-10-01 00:00:00" } };
  assert.equal((await post(`${base}/v1/webhooks/pipedrive`, ev)).status, 401);
  assert.equal((await post(`${base}/v1/webhooks/pipedrive?key=wrong-key-123456789`, ev)).status, 401);
  const basic = "Basic " + Buffer.from(`crm:${KEY}`).toString("base64");
  const r = await post(`${base}/v1/webhooks/pipedrive`, ev, { authorization: basic });
  assert.equal(r.status, 200); assert.equal((await r.json()).id, "pd-5");
  assert.equal(state.deals["pd-5"].amount, 500);
  assert.equal((await post(`${base}/v1/webhooks/pipedrive?key=${KEY}`, { event: "updated.deal", current: { id: 5, value: 800 } })).status, 200);
  assert.equal(state.deals["pd-5"].amount, 800);
  const del = await post(`${base}/v1/webhooks/pipedrive`, { event: "deleted.deal", previous: { id: 5 } }, { authorization: `Bearer ${KEY}` });
  assert.equal((await del.json()).removed, "pd-5"); assert.equal(state.deals["pd-5"], undefined);
  const hs = await post(`${base}/v1/webhooks/hubspot?key=${KEY}`, { hs_object_id: "9", dealname: "H" });
  assert.equal((await hs.json()).id, "hs-9");
  const skipped = await post(`${base}/v1/webhooks/hubspot?key=${KEY}`, { nothing: true });
  assert.equal(skipped.status, 200); assert.ok((await skipped.json()).skipped);
  srv.close();
});
