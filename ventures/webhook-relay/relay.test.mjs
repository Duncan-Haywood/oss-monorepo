import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_POLICY, newState, classify, parseRetryAfter, ingest, due, recordAttempt, replay, prune, summary, schedule, idempotencyKey } from "./relay.mjs";

const T0 = 1_700_000_000_000;
const mk = (state, body = "{}", headers = {}, now = T0) => ingest(state, { route: "r", target: "http://x", headers, body: Buffer.from(body), now });

test("classify: 2xx delivered, transient retried, other 4xx dead", () => {
  assert.equal(classify(200), "delivered");
  assert.equal(classify(204), "delivered");
  for (const s of [0, 408, 425, 429, 500, 502, 503]) assert.equal(classify(s), "retry", String(s));
  for (const s of [400, 401, 404, 410, 422]) assert.equal(classify(s), "dead", String(s));
  assert.equal(classify(301), "dead");
});

test("ingest stores exact bytes and is due immediately", () => {
  const s = newState();
  const bin = Buffer.from([0, 255, 10, 13, 128]);
  const { id } = ingest(s, { route: "r", target: "http://x", headers: {}, body: bin, now: T0 });
  assert.deepEqual(Buffer.from(s.events[id].bodyB64, "base64"), bin);
  assert.equal(due(s, T0).length, 1);
  assert.equal(due(s, T0 - 1).length, 0);
});

test("provider event ids dedupe a provider-side retry", () => {
  const s = newState();
  const a = mk(s, "{}", { "webhook-id": "msg_1" });
  const b = mk(s, "{}", { "webhook-id": "msg_1" });
  assert.equal(b.duplicate, true);
  assert.equal(b.id, a.id);
  assert.equal(Object.keys(s.events).length, 1);
  assert.equal(idempotencyKey("r", {}, JSON.stringify({ id: "evt_9", type: "x.y" })), "r:evt_9");
  assert.equal(idempotencyKey("r", {}, "not json"), null);
  const c = mk(s, "{}", {}); const d = mk(s, "{}", {});
  assert.notEqual(c.id, d.id, "no key means no dedupe");
});

test("failures back off along the policy, then go dead after the budget", () => {
  const s = newState();
  const { id } = mk(s);
  let now = T0;
  for (let i = 0; i < DEFAULT_POLICY.delays.length; i += 1) {
    assert.equal(recordAttempt(s, id, { status: 503 }, now), "pending");
    assert.equal(s.events[id].nextAt, now + DEFAULT_POLICY.delays[i] * 1000, `retry ${i + 1}`);
    now = s.events[id].nextAt;
  }
  assert.equal(recordAttempt(s, id, { status: 503 }, now), "dead");
  assert.equal(s.events[id].attempts.length, DEFAULT_POLICY.delays.length + 1);
  assert.equal(due(s, now + 1e12).length, 0, "dead events are not retried");
});

test("a permanent 4xx goes dead on the first attempt; success clears the schedule", () => {
  const s = newState();
  const a = mk(s).id, b = mk(s).id;
  assert.equal(recordAttempt(s, a, { status: 404 }, T0), "dead");
  assert.equal(recordAttempt(s, b, { status: 500 }, T0), "pending");
  assert.equal(recordAttempt(s, b, { status: 200 }, T0 + 20_000), "delivered");
  assert.equal(s.events[b].nextAt, null);
  assert.equal(s.events[b].deliveredAt, T0 + 20_000);
});

test("Retry-After lengthens the wait but never shortens it, and is capped", () => {
  assert.equal(parseRetryAfter("120", T0), 120);
  assert.equal(parseRetryAfter(new Date(T0 + 90_000).toUTCString(), T0), 90);
  assert.equal(parseRetryAfter("soon", T0), null);
  const s = newState(); const { id } = mk(s);
  recordAttempt(s, id, { status: 429, retryAfter: "3600" }, T0);
  assert.equal(s.events[id].nextAt, T0 + 3600_000);
  const t = newState(); const x = mk(t).id;
  recordAttempt(t, x, { status: 429, retryAfter: "1" }, T0);
  assert.equal(t.events[x].nextAt, T0 + 10_000);
  const u = newState(); const y = mk(u).id;
  recordAttempt(u, y, { status: 503, retryAfter: "99999999" }, T0);
  assert.equal(u.events[y].nextAt, T0 + DEFAULT_POLICY.retryAfterCapSec * 1000);
});

test("replay restores a dead event with a fresh budget and keeps its history", () => {
  const s = newState(); const { id } = mk(s);
  recordAttempt(s, id, { status: 410 }, T0);
  assert.equal(s.events[id].status, "dead");
  replay(s, id, T0 + 5000);
  assert.equal(s.events[id].status, "pending");
  assert.equal(due(s, T0 + 5000).length, 1);
  assert.equal(recordAttempt(s, id, { status: 500 }, T0 + 5000), "pending");
  assert.equal(s.events[id].nextAt, T0 + 5000 + DEFAULT_POLICY.delays[0] * 1000, "budget restarted");
  assert.equal(s.events[id].attempts.length, 2);
  assert.equal(replay(s, "nope", T0), null);
});

test("prune drops settled events past retention and keeps pending ones", () => {
  const s = newState();
  const old = mk(s, "a", {}, T0).id, pend = mk(s, "b", {}, T0).id;
  recordAttempt(s, old, { status: 200 }, T0);
  prune(s, T0 + 15 * 86400_000);
  assert.equal(s.events[old], undefined);
  assert.ok(s.events[pend]);
  const t = newState();
  for (let i = 0; i < 6; i += 1) recordAttempt(t, mk(t, String(i), {}, T0 + i).id, { status: 200 }, T0 + i);
  prune(t, T0 + 10, { ...DEFAULT_POLICY, maxEvents: 3 });
  assert.equal(Object.keys(t.events).length, 3);
});

test("summary counts per route; schedule lists the cumulative timeline", () => {
  const s = newState(); const a = mk(s).id; mk(s);
  recordAttempt(s, a, { status: 200 }, T0);
  assert.deepEqual(summary(s), { total: 2, pending: 1, delivered: 1, dead: 0, byRoute: { r: { pending: 1, delivered: 1, dead: 0 } } });
  const sch = schedule();
  assert.equal(sch.length, DEFAULT_POLICY.delays.length + 1);
  assert.equal(sch.at(-1).atSec, DEFAULT_POLICY.delays.reduce((x, y) => x + y, 0));
});

test("fan-out: one event per target, deduped per target, independent fates", () => {
  const s = newState();
  const hd = { "webhook-id": "msg_1" };
  const r = ingest(s, { route: "r", targets: ["http://a", "http://b", "http://a"], headers: hd, body: Buffer.from("{}"), now: T0 });
  assert.equal(r.ids.length, 2);
  assert.equal(r.duplicate, false);
  const again = ingest(s, { route: "r", targets: ["http://a", "http://b"], headers: hd, body: Buffer.from("{}"), now: T0 + 1 });
  assert.equal(again.duplicate, true);
  assert.deepEqual(again.ids, r.ids);
  recordAttempt(s, r.ids[0], { status: 200 }, T0);
  recordAttempt(s, r.ids[1], { status: 400 }, T0);
  assert.equal(s.events[r.ids[0]].status, "delivered");
  assert.equal(s.events[r.ids[1]].status, "dead");
});
