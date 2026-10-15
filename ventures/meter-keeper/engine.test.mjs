import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "./engine.mjs";

const NOW = Date.UTC(2026, 9, 15, 12);
const cfg = {
  meters: { api: { agg: "sum", stripeEvent: "api_calls" }, seats: { agg: "unique", stripeEvent: "active_seats" }, peak: { agg: "max" }, jobs: { agg: "count" } },
  plans: { pro: { base: 4900, minimum: 5000, lines: [
    { meter: "api", model: "graduated", included: 1000, limit: 50_000, tiers: [{ upTo: 11_000, unit: 0.1 }, { upTo: null, unit: 0.05 }] },
    { meter: "seats", model: "flat", unit: 500 },
    { meter: "jobs", model: "package", size: 100, unit: 200 },
  ] } },
};
const mk = () => { const s = E.newState(); E.setCustomer(s, "acme", { plan: "pro", stripeCustomerId: "cus_1" }); return s; };
const ev = (id, over = {}) => ({ id, customer: "acme", meter: "api", value: 1, ...over });

test("config validation names the problem", () => {
  assert.deepEqual(E.validateConfig(cfg), []);
  const bad = { meters: { x: { agg: "median" } }, plans: { p: { lines: [{ meter: "nope", model: "graduated", tiers: [{ upTo: 5, unit: 1 }] }] } } };
  const errs = E.validateConfig(bad).join("|");
  assert.match(errs, /agg must be one of/); assert.match(errs, /unknown meter "nope"/); assert.match(errs, /last tier must have upTo null/);
});

test("events are idempotent on id", () => {
  const s = mk();
  assert.equal(E.ingest(s, cfg, ev("e1", { value: 5 }), NOW).status, "accepted");
  assert.equal(E.ingest(s, cfg, ev("e1", { value: 5 }), NOW).status, "duplicate");
  const p = E.periodOf(NOW);
  assert.equal(E.usage(s, cfg, "acme", "api", p.from, p.to), 5);
  assert.equal(s.outbox.length, 1);
});

test("bad events are refused with a reason", () => {
  const s = mk();
  assert.throws(() => E.ingest(s, cfg, { ...ev("a"), meter: "ghost" }, NOW), /unknown meter/);
  assert.throws(() => E.ingest(s, cfg, ev("b", { value: -1 }), NOW), /value must be/);
  assert.throws(() => E.ingest(s, cfg, ev("c", { timestamp: NOW - 40 * 86_400_000 }), NOW), /35 days/);
  assert.throws(() => E.ingest(s, cfg, ev("d", { timestamp: NOW + 3_600_000 }), NOW), /future/);
  assert.throws(() => E.ingest(s, cfg, ev("e", { meter: "seats" }), NOW), /needs a key/);
  assert.throws(() => E.ingest(s, cfg, ev("bad id!"), NOW), /id is required/);
});

test("sum, count, max and unique aggregate as named", () => {
  const s = mk(), p = E.periodOf(NOW);
  E.ingest(s, cfg, ev("1", { meter: "peak", value: 7 }), NOW); E.ingest(s, cfg, ev("2", { meter: "peak", value: 3 }), NOW);
  for (const [i, k] of ["u1", "u2", "u1"].entries()) E.ingest(s, cfg, ev("s" + i, { meter: "seats", key: k }), NOW);
  for (let i = 0; i < 3; i++) E.ingest(s, cfg, ev("j" + i, { meter: "jobs", value: 99 }), NOW);
  const u = (m) => E.usage(s, cfg, "acme", m, p.from, p.to);
  assert.equal(u("peak"), 7); assert.equal(u("seats"), 2); assert.equal(u("jobs"), 3);
});

test("a unique key is forwarded to Stripe once a month, not once an event", () => {
  const s = mk();
  for (const [i, k] of ["u1", "u1", "u2"].entries()) E.ingest(s, cfg, ev("s" + i, { meter: "seats", key: k }), NOW);
  assert.equal(s.outbox.length, 2);
  E.ingest(s, cfg, ev("next", { meter: "seats", key: "u1", timestamp: NOW + 30_000 }), NOW + 30_000);
  assert.equal(s.outbox.length, 2);
});

test("usage ignores other months", () => {
  const s = mk(), p = E.periodOf(NOW), lastMonth = Date.UTC(2026, 8, 20);
  E.ingest(s, cfg, ev("old", { value: 400, timestamp: lastMonth }), NOW);
  E.ingest(s, cfg, ev("new", { value: 9 }), NOW);
  assert.equal(E.usage(s, cfg, "acme", "api", p.from, p.to), 9);
  assert.equal(E.usage(s, cfg, "acme", "api", E.periodOf(lastMonth).from, E.periodOf(lastMonth).to), 400);
});

test("pricing models", () => {
  const grad = { model: "graduated", included: 1000, tiers: [{ upTo: 11_000, unit: 0.1 }, { upTo: null, unit: 0.05 }] };
  assert.equal(E.price(grad, 500), 0);
  assert.equal(E.price(grad, 6000), 500); // 5,000 billable x 0.10
  assert.equal(E.price(grad, 21_000), 1100 + 450); // 20,000 billable: 11,000 at 0.10 then 9,000 at 0.05 (tiers count billable units, after the included ones)
  const vol = { model: "volume", tiers: [{ upTo: 100, unit: 1, flat: 50 }, { upTo: null, unit: 0.5 }] };
  assert.equal(E.price(vol, 100), 150); assert.equal(E.price(vol, 101), 50.5); assert.equal(E.price(vol, 0), 0);
  const pkg = { model: "package", size: 100, unit: 200 };
  assert.equal(E.price(pkg, 1), 200); assert.equal(E.price(pkg, 100), 200); assert.equal(E.price(pkg, 101), 400); assert.equal(E.price(pkg, 0), 0);
  assert.equal(E.price({ model: "flat", unit: 3, included: 2 }, 10), 24);
});

test("invoice preview adds base, lines and the minimum top-up", () => {
  const s = mk();
  E.ingest(s, cfg, ev("a", { value: 6000 }), NOW);
  E.ingest(s, cfg, ev("u", { meter: "seats", key: "k1" }), NOW);
  E.ingest(s, cfg, ev("j", { meter: "jobs" }), NOW);
  const inv = E.invoice(s, cfg, "acme", NOW);
  assert.deepEqual(inv.lines.map((l) => [l.meter, l.quantity, l.amount]), [["api", 6000, 500], ["seats", 1, 500], ["jobs", 1, 200]]);
  assert.equal(inv.total, 4900 + 500 + 500 + 200); assert.equal(inv.minimumTopUp, 0);
  const empty = E.invoice(mk(), cfg, "acme", NOW);
  assert.equal(empty.total, 5000); assert.equal(empty.minimumTopUp, 100);
  assert.throws(() => E.invoice(s, cfg, "nobody", NOW), /unknown customer/);
});

test("projection extrapolates sums but not peaks or unique counts", () => {
  const s = mk(), tenth = Date.UTC(2026, 9, 11); // 10 days elapsed of 31
  E.ingest(s, cfg, ev("a", { value: 3100, timestamp: tenth - 1000 }), tenth);
  const p = E.projection(s, cfg, "acme", tenth);
  assert.equal(p.lines.find((l) => l.meter === "api").quantity, 9610); // 3100 over 10 days, scaled to 31
});

test("check enforces the plan's hard limit and reports what is left", () => {
  const s = mk();
  E.ingest(s, cfg, ev("a", { value: 49_990 }), NOW);
  assert.deepEqual(E.check(s, cfg, "acme", "api", 10, NOW), { allowed: true, used: 49_990, limit: 50_000, remaining: 10, resetsAt: "2026-11-01T00:00:00.000Z" });
  assert.equal(E.check(s, cfg, "acme", "api", 11, NOW).allowed, false);
  assert.equal(E.check(s, cfg, "acme", "jobs", 1e9, NOW).allowed, true); // no limit set
});

test("flush forwards events, retries server errors and dead-letters permanent ones", async () => {
  const s = mk(); E.setCustomer(s, "nostripe", { plan: "pro" });
  E.ingest(s, cfg, ev("ok"), NOW); E.ingest(s, cfg, ev("slow", { value: 2 }), NOW); E.ingest(s, cfg, ev("bad", { value: 3 }), NOW); E.ingest(s, cfg, ev("orphan", { customer: "nostripe" }), NOW);
  const got = [];
  const send = async (o) => { got.push(o.id); if (o.id === "slow") throw Object.assign(new Error("stripe 503"), { retry: true }); if (o.id === "bad") throw Object.assign(new Error("stripe 400"), { retry: false }); };
  const r = await E.flush(s, send, NOW);
  assert.deepEqual(r, { sent: 1, retried: 1, dead: 2, pending: 1 });
  assert.deepEqual(s.dead.map((d) => d.id).sort(), ["bad", "orphan"]);
  assert.equal(s.outbox[0].next > NOW, true);
  assert.deepEqual((await E.flush(s, send, NOW)).sent, 0); // backed off, not due yet
});

test("prune forgets old idempotency records but keeps recent ones", () => {
  const s = mk(); E.ingest(s, cfg, ev("recent"), NOW);
  s.seen.ancient = NOW - 60 * 86_400_000;
  E.prune(s, NOW);
  assert.ok(s.seen.recent); assert.equal(s.seen.ancient, undefined);
});

test("csv export lists one row per customer and meter", () => {
  const s = mk(); E.ingest(s, cfg, ev("a"), NOW);
  assert.equal(E.toCsv(s, cfg, NOW), "customer,meter,agg,period_start,quantity\nacme,api,sum,2026-10-01,1\n");
});
