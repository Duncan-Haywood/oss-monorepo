// The metered plan's scheduled settlement (worker/settle-clock.mjs): which months are due, a run
// against the real billing code and the fake provider, the alarm chain, and the off switch. The
// Durable Object's state is faked; the Worker itself is not built. Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createBilling } from "../pro/billing.mjs";
import { MemoryStore } from "../pro/store.mjs";
import {
  FIRST_RUN_MS,
  SETTLE_EVERY_MS,
  SETTLED_KEY,
  armSettleClock,
  duePeriods,
  previousPeriod,
  runSettlement,
  settleClockClass,
} from "./settle-clock.mjs";

const at = (/** @type {string} */ iso) => new Date(iso);

function fakeStorage() {
  const kv = new Map();
  let alarm = null;
  return {
    kv,
    get: async (k) => kv.get(k),
    put: async (k, v) => void kv.set(k, v),
    getAlarm: async () => alarm,
    setAlarm: async (t) => void (alarm = t),
    alarmAt: () => alarm,
  };
}

test("previousPeriod crosses the year", () => {
  assert.equal(previousPeriod("2027-01"), "2026-12");
  assert.equal(previousPeriod("2026-11"), "2026-10");
  assert.equal(previousPeriod("2026-10"), "2026-09");
});

test("a month is due from 06:00 UTC on the 1st, once, with a capped catch-up", () => {
  // Before the grace ends on 1 Dec, November is not due yet; October is.
  assert.deepEqual(duePeriods(at("2026-12-01T05:59:59Z"), null), ["2026-10"]);
  assert.deepEqual(duePeriods(at("2026-12-01T05:59:59Z"), "2026-10"), []);
  assert.deepEqual(duePeriods(at("2026-12-01T06:00:00Z"), "2026-10"), ["2026-11"]);
  assert.deepEqual(duePeriods(at("2026-12-15T00:00:00Z"), "2026-11"), []);
  // First run ever: only the latest closed month.
  assert.deepEqual(duePeriods(at("2026-12-15T00:00:00Z"), null), ["2026-11"]);
  // A gap: the months since, oldest first, at most three, across a year end.
  assert.deepEqual(duePeriods(at("2027-02-10T00:00:00Z"), "2026-11"), ["2026-12", "2027-01"]);
  assert.deepEqual(duePeriods(at("2027-06-10T00:00:00Z"), "2026-11"), ["2027-03", "2027-04", "2027-05"]);
});

/** The real billing on the fake provider (APP_ENV=test), one `api` vendor over the minimum. */
async function vendorWithUsage(clock) {
  const now = () => clock.t;
  const store = new MemoryStore({ now });
  const billing = createBilling({ env: { APP_ENV: "test", APP_URL: "http://localhost:8790" }, store, now, log: () => {} });
  const big = await store.createAccount({ name: "Vendor", plan: "trial" });
  const small = await store.createAccount({ name: "Small vendor", plan: "trial" });
  for (const a of [big, small]) {
    await store.upsertSubscription(a.id, {
      planKey: "api", status: "active", providerCustomerId: `ctm_${a.id}`, providerSubscriptionId: `sub_${a.id}`,
      currentPeriodStart: "2026-11-01T00:00:00Z", currentPeriodEnd: "2026-12-01T00:00:00Z", cancelAtPeriodEnd: false,
      providerUpdatedAt: null, pastDueSince: null,
    });
  }
  // 18,000 validated, 100 with errors: 2,520 + 400 = 2,920 cents, 1,020 above the €19 minimum.
  const hashes = Array.from({ length: 18_000 }, (_, i) => `h${i}`);
  await store.meterDocuments(big.id, "2026-11", hashes, Number.MAX_SAFE_INTEGER);
  await store.markDocumentsWithErrors(big.id, "2026-11", hashes.slice(0, 100));
  await store.meterDocuments(small.id, "2026-11", ["x"], Number.MAX_SAFE_INTEGER);
  return { store, billing, big, small, now };
}

test("a run settles the closed month once; a second run and the admin endpoint never charge again", async () => {
  const clock = { t: at("2026-12-01T07:00:00Z") };
  const { store, billing, big, small, now } = await vendorWithUsage(clock);
  const storage = fakeStorage();
  storage.kv.set(SETTLED_KEY, "2026-10");
  const logs = [];
  const log = (event, data) => logs.push({ event, ...data });

  const first = await runSettlement(billing, storage, { now, log });
  assert.deepEqual(first, { settled: ["2026-11"], stopped: null });
  assert.equal(storage.kv.get(SETTLED_KEY), "2026-11");
  const charge = await store.getUsageCharge(big.id, "2026-11");
  assert.deepEqual([charge.status, charge.amountMinor], ["charged", (await billing.usageStatement(big, "2026-11")).overageCents]);
  assert.ok(charge.amountMinor > 0);
  assert.equal((await store.getUsageCharge(small.id, "2026-11")).status, "none");
  const done = logs.find((l) => l.event === "usage_settlement.done");
  assert.deepEqual(done.counts, { charged: 1, none: 1 });
  assert.deepEqual(done.attention, []);
  assert.ok(!JSON.stringify(logs).includes("Vendor"), "no account names in the log");

  // The next alarm the same month: nothing due, nothing called.
  clock.t = at("2026-12-01T13:00:00Z");
  assert.deepEqual(await runSettlement(billing, storage, { now, log }), { settled: [], stopped: null });
  // Even if the stored month were lost, the claims hold: "already", never a second charge.
  storage.kv.delete(SETTLED_KEY);
  await runSettlement(billing, storage, { now, log });
  const again = (await billing.settleUsage("2026-11")).results.map((r) => r.status);
  assert.deepEqual(again, ["already", "already"]);
  assert.equal((await store.getUsageCharge(big.id, "2026-11")).status, "charged");
});

test("billing dark: logged, nothing stored, the month stays due", async () => {
  const store = new MemoryStore({ now: () => at("2026-12-02T00:00:00Z") });
  const billing = createBilling({ env: { BILLING_PROVIDER: "none" }, store, now: () => at("2026-12-02T00:00:00Z"), log: () => {} });
  const storage = fakeStorage();
  const logs = [];
  const r = await runSettlement(billing, storage, { now: () => at("2026-12-02T00:00:00Z"), log: (event, d) => logs.push({ event, ...d }) });
  assert.deepEqual(r.settled, []);
  assert.ok(r.stopped);
  assert.equal(storage.kv.get(SETTLED_KEY), undefined);
  assert.equal(logs[0].event, "usage_settlement.unavailable");
});

test("USAGE_SETTLEMENT=off calls nothing", async () => {
  let called = 0;
  const billing = { settleUsage: async () => (called++, { period: "", results: [] }) };
  const r = await runSettlement(billing, fakeStorage(), { now: () => at("2026-12-02T00:00:00Z"), env: { USAGE_SETTLEMENT: "OFF" }, log: () => {} });
  assert.equal(called, 0);
  assert.equal(r.stopped, "USAGE_SETTLEMENT=off");
});

test("a store error stops at that month and keeps the earlier ones", async () => {
  const seen = [];
  const billing = {
    settleUsage: async (p) => {
      seen.push(p);
      if (p === "2027-01") throw new Error("D1 timeout");
      return { period: p, results: [] };
    },
  };
  const storage = fakeStorage();
  storage.kv.set(SETTLED_KEY, "2026-11");
  const r = await runSettlement(billing, storage, { now: () => at("2027-03-05T00:00:00Z"), log: () => {} });
  assert.deepEqual(seen, ["2026-12", "2027-01"]);
  assert.deepEqual(r.settled, ["2026-12"]);
  assert.equal(storage.kv.get(SETTLED_KEY), "2026-12");
});

test("the Durable Object arms once, re-arms before each run, and survives a throwing run", async () => {
  const T = at("2026-12-01T07:00:00Z").getTime();
  let calls = 0;
  const SettleClock = settleClockClass(async () => ({ settleUsage: async () => { calls++; throw Object.assign(new Error("boom"), { status: 500 }); } }), { now: () => new Date(T), log: () => {} });
  const storage = fakeStorage();
  const obj = new SettleClock({ storage }, {});
  assert.equal(await (await obj.fetch()).text(), "armed");
  assert.equal(storage.alarmAt(), T + FIRST_RUN_MS);
  assert.equal(await (await obj.fetch()).text(), "already armed");
  await obj.alarm();
  assert.equal(calls, 1);
  assert.equal(storage.alarmAt(), T + SETTLE_EVERY_MS, "the chain continues after a failure");
  // billingFor itself throwing (no D1) is caught too.
  const Broken = settleClockClass(async () => { throw new Error("no D1 binding"); }, { now: () => new Date(T), log: () => {} });
  const s2 = fakeStorage();
  await new Broken({ storage: s2 }, {}).alarm();
  assert.equal(s2.alarmAt(), T + SETTLE_EVERY_MS);
});

test("armSettleClock: once per isolate, retried after a failure, a no-op without the binding", async () => {
  await armSettleClock({});
  let fetches = 0;
  let fail = true;
  const ns = { idFromName: (n) => n, get: () => ({ fetch: async () => { fetches++; if (fail) throw new Error("down"); return new Response("armed"); } }) };
  const warn = console.warn;
  console.warn = () => {};
  try {
    await armSettleClock({ SETTLE_CLOCK: ns });
    fail = false;
    await armSettleClock({ SETTLE_CLOCK: ns });
    await armSettleClock({ SETTLE_CLOCK: ns });
  } finally {
    console.warn = warn;
  }
  assert.equal(fetches, 2);
});
