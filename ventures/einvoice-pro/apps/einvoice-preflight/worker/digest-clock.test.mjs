// The client summary email's schedule (worker/digest-clock.mjs): when each summary is due, a run
// against the real store and digest code with the FakeMailer, retries after a failure, the send
// limit, the off switch, and the alarm chain. The Durable Object's state is faked; the Worker is
// not built. Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SEND_LIMIT } from "../pro/digest.mjs";
import { FakeMailer } from "../pro/email.mjs";
import { MemoryStore } from "../pro/store.mjs";
import {
  DIGEST_EVERY_MS,
  FIRST_RUN_MS,
  MAX_TRIES,
  MORE_MS,
  appUrlOf,
  armDigestClock,
  digestClockClass,
  dueDigests,
  runDigests,
  sendFrom,
} from "./digest-clock.mjs";

const at = (/** @type {string} */ iso) => new Date(iso);
const ON = { DIGEST_SCHEDULE: "on" };
const APP = "https://einvoice.example";

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

test("send times: Monday 07:00 UTC for the week, the 1st 07:00 UTC for the month", () => {
  // 2026-11-30 is a Monday (ISO week 49); 2026-12-06 the Sunday of that week.
  assert.equal(sendFrom("weekly", at("2026-12-06T23:00:00Z")).toISOString(), "2026-11-30T07:00:00.000Z");
  assert.equal(sendFrom("weekly", at("2026-11-30T03:00:00Z")).toISOString(), "2026-11-30T07:00:00.000Z");
  assert.equal(sendFrom("monthly", at("2026-12-17T00:00:00Z")).toISOString(), "2026-12-01T07:00:00.000Z");
  // Before 07:00 on Monday, last week's summary is the one in question, and it is done.
  assert.deepEqual(dueDigests(at("2026-11-30T06:59:59Z"), { weekly: "2026-W48" }), []);
  assert.deepEqual(dueDigests(at("2026-11-30T07:00:00Z"), { weekly: "2026-W48", monthly: "2026-11" }), [{ frequency: "weekly", period: "2026-W49" }]);
  assert.deepEqual(dueDigests(at("2026-12-01T07:00:00Z"), { weekly: "2026-W49", monthly: "2026-11" }), [{ frequency: "monthly", period: "2026-12" }]);
  assert.deepEqual(dueDigests(at("2026-12-03T12:00:00Z"), { weekly: "2026-W49", monthly: "2026-12" }), []);
  // Too late: more than LATE_DAYS after the send time, the period is skipped.
  assert.deepEqual(dueDigests(at("2026-12-02T06:59:59Z"), { monthly: "2026-12" }), [{ frequency: "weekly", period: "2026-W49" }]);
  assert.deepEqual(dueDigests(at("2026-12-04T07:00:00Z"), { weekly: "2026-W49" }), []);
  // Across a year end: 2027-01-01 is a Friday in ISO week 2026-W53; 2027-01-04 starts 2027-W01.
  assert.deepEqual(dueDigests(at("2027-01-01T08:00:00Z"), { weekly: "2026-W53", monthly: "2026-12" }), [{ frequency: "monthly", period: "2027-01" }]);
  assert.deepEqual(dueDigests(at("2027-01-04T07:00:00Z"), { weekly: "2026-W53", monthly: "2027-01" }), [{ frequency: "weekly", period: "2027-W01" }]);
});

test("appUrlOf takes an origin only, as the server does", () => {
  assert.equal(appUrlOf({ APP_URL: "https://einvoice.example/" }), APP);
  assert.equal(appUrlOf({ APP_URL: "https://einvoice.example/app" }), "");
  assert.equal(appUrlOf({}), "");
});

/** A firm with a confirmed address, the summary on, and one failing client. */
async function firm(store, name, email, digest = "weekly") {
  const a = await store.createAccount({ name, plan: "trial" });
  await store.setAccountEmail(a.id, email);
  await store.setAccountDigest(a.id, digest, "de");
  const c = await store.createClient(a.id, { name: `${name} Mandant GmbH`, country: "DE", vatId: "DE123456789", reference: "M-1" });
  await store.addRun(a.id, {
    clientId: c.id,
    lang: "de",
    profile: "",
    totals: { files: 1, passed: 0, failed: 1, fixable: 0 },
    files: [{ file: "geheim.xml", sha256: "x1", bytes: 10, status: "fail", rules: ["BR-CO-15"], blocking: 1, fixesApplied: [], fixedSha256: null, fixedStatus: null }],
  });
  return a;
}

test("a run sends each due summary once; the next hourly run sends nothing", async () => {
  const clock = { t: at("2026-11-30T07:30:00Z") };
  const now = () => clock.t;
  const store = new MemoryStore({ now });
  await firm(store, "Kanzlei A", "a@kanzlei.example", "weekly");
  await firm(store, "Cabinet B", "b@cabinet.example", "monthly");
  const mailer = new FakeMailer();
  const storage = fakeStorage();
  const logs = [];
  const log = (event, data) => logs.push({ event, ...data });
  const deps = async () => ({ store, mailer, appUrl: APP });

  const r = await runDigests(deps, storage, { now, env: ON, log });
  assert.deepEqual(r.ran, [{ frequency: "weekly", period: "2026-W49", outcome: "done" }]);
  assert.equal(r.next, DIGEST_EVERY_MS);
  assert.deepEqual(mailer.outbox.map((m) => m.to), ["a@kanzlei.example"]);
  assert.match(mailer.outbox[0].text, new RegExp(`${APP}/app`));
  assert.equal(storage.kv.get("done:weekly"), "2026-W49");

  clock.t = at("2026-11-30T08:30:00Z");
  assert.deepEqual((await runDigests(deps, storage, { now, env: ON, log })).ran, []);
  // The monthly one on the 1st.
  clock.t = at("2026-12-01T07:00:00Z");
  assert.deepEqual((await runDigests(deps, storage, { now, env: ON, log })).ran, [{ frequency: "monthly", period: "2026-12", outcome: "done" }]);
  assert.deepEqual(mailer.outbox.map((m) => m.to), ["a@kanzlei.example", "b@cabinet.example"]);
  // Even if the DO's state were lost, the store's claims hold: nothing is sent twice.
  storage.kv.clear();
  await runDigests(deps, storage, { now, env: ON, log });
  assert.equal(mailer.outbox.length, 2);

  const text = JSON.stringify(logs);
  for (const secret of ["Kanzlei", "Cabinet", "kanzlei.example", "Mandant", "DE123456789", "geheim"]) assert.ok(!text.includes(secret), `no ${secret} in the log`);
});

test("off by default: no switch, no send, and the chain ends", async () => {
  let asked = 0;
  const deps = async () => (asked++, { store: null, mailer: new FakeMailer(), appUrl: APP });
  for (const env of [{}, { DIGEST_SCHEDULE: "off" }, { DIGEST_SCHEDULE: "yes" }]) {
    const r = await runDigests(deps, fakeStorage(), { now: () => at("2026-11-30T08:00:00Z"), env, log: () => {} });
    assert.deepEqual(r, { next: null, ran: [] });
  }
  assert.equal(asked, 0);
});

test("no mailer or APP_URL: nothing claimed, the period stays due", async () => {
  const now = () => at("2026-11-30T08:00:00Z");
  const store = new MemoryStore({ now });
  await firm(store, "Kanzlei A", "a@kanzlei.example");
  const storage = fakeStorage();
  const logs = [];
  for (const d of [{ mailer: null, appUrl: APP }, { mailer: new FakeMailer(), appUrl: "" }]) {
    const r = await runDigests(async () => ({ store, ...d }), storage, { now, env: ON, log: (event, x) => logs.push({ event, ...x }) });
    assert.equal(r.next, DIGEST_EVERY_MS);
  }
  assert.deepEqual(logs.map((l) => l.event), ["digest_schedule.unavailable", "digest_schedule.unavailable"]);
  assert.equal(storage.kv.get("done:weekly"), undefined);
  // Mail on later: sent then.
  const mailer = new FakeMailer();
  await runDigests(async () => ({ store, mailer, appUrl: APP }), storage, { now, env: ON, log: () => {} });
  assert.equal(mailer.outbox.length, 1);
});

test("a failed send is retried on the next runs, then the period is closed after MAX_TRIES", async () => {
  const clock = { t: at("2026-11-30T07:00:00Z") };
  const now = () => clock.t;
  const store = new MemoryStore({ now });
  await firm(store, "Kanzlei A", "a@kanzlei.example");
  await firm(store, "Kanzlei B", "b@bounce.example");
  const inner = new FakeMailer();
  const mailer = { name: "flaky", send: async (m) => { if (m.to === "b@bounce.example") throw new Error("Email send failed: 422"); return inner.send(m); } };
  const storage = fakeStorage();
  const outcomes = [];
  for (let i = 0; i < MAX_TRIES + 1; i++) {
    const r = await runDigests(async () => ({ store, mailer, appUrl: APP }), storage, { now, env: ON, log: () => {} });
    outcomes.push(r.ran.map((x) => x.outcome).join());
    clock.t = new Date(clock.t.getTime() + DIGEST_EVERY_MS);
  }
  assert.deepEqual(outcomes, [...Array(MAX_TRIES - 1).fill("retry"), "gave_up", ""]);
  assert.deepEqual(inner.outbox.map((m) => m.to), ["a@kanzlei.example"], "the good address is mailed once");
  assert.equal(storage.kv.get("done:weekly"), "2026-W49");
});

test("more than the send limit: the next run is a minute away and picks up the rest", async () => {
  const now = () => at("2026-11-30T07:00:00Z");
  const store = new MemoryStore({ now });
  for (let i = 0; i <= DEFAULT_SEND_LIMIT; i++) await firm(store, `Firm ${i}`, `f${i}@firm.example`);
  const mailer = new FakeMailer();
  const storage = fakeStorage();
  const deps = async () => ({ store, mailer, appUrl: APP });
  const first = await runDigests(deps, storage, { now, env: ON, log: () => {} });
  assert.equal(first.next, MORE_MS);
  assert.equal(mailer.outbox.length, DEFAULT_SEND_LIMIT);
  assert.equal(storage.kv.get("done:weekly"), undefined);
  const second = await runDigests(deps, storage, { now, env: ON, log: () => {} });
  assert.equal(second.next, DIGEST_EVERY_MS);
  assert.equal(mailer.outbox.length, DEFAULT_SEND_LIMIT + 1);
  assert.equal(new Set(mailer.outbox.map((m) => m.to)).size, DEFAULT_SEND_LIMIT + 1);
});

test("the Durable Object: arms, re-arms hourly, a minute when more wait, survives a throw, stops when off", async () => {
  const T = at("2026-11-30T07:00:00Z").getTime();
  const now = () => new Date(T);
  const store = new MemoryStore({ now });
  for (let i = 0; i <= DEFAULT_SEND_LIMIT; i++) await firm(store, `Firm ${i}`, `f${i}@firm.example`);
  const mailer = new FakeMailer();
  const Clock = digestClockClass(async () => ({ store, mailer, appUrl: APP }), { now, log: () => {} });
  const storage = fakeStorage();
  const obj = new Clock({ storage }, ON);
  assert.equal(await (await obj.fetch()).text(), "armed");
  assert.equal(storage.alarmAt(), T + FIRST_RUN_MS);
  assert.equal(await (await obj.fetch()).text(), "already armed");
  await obj.alarm();
  assert.equal(storage.alarmAt(), T + MORE_MS);
  await obj.alarm();
  assert.equal(storage.alarmAt(), T + DIGEST_EVERY_MS);
  assert.equal(mailer.outbox.length, DEFAULT_SEND_LIMIT + 1);

  const Broken = digestClockClass(async () => { throw new Error("no D1 binding"); }, { now, log: () => {} });
  const s2 = fakeStorage();
  await new Broken({ storage: s2 }, ON).alarm();
  assert.equal(s2.alarmAt(), T + DIGEST_EVERY_MS, "the chain continues after a failure");

  const s3 = fakeStorage();
  await new Clock({ storage: s3 }, {}).alarm();
  assert.equal(s3.alarmAt(), null, "off: no next alarm");
});

test("armDigestClock: only with the switch on, once per isolate, retried after a failure", async () => {
  await armDigestClock({});
  let fetches = 0;
  let fail = true;
  const ns = { idFromName: (n) => n, get: () => ({ fetch: async () => { fetches++; if (fail) throw new Error("down"); return new Response("armed"); } }) };
  await armDigestClock({ DIGEST_CLOCK: ns });
  assert.equal(fetches, 0, "not armed while off");
  const warn = console.warn;
  console.warn = () => {};
  try {
    await armDigestClock({ DIGEST_CLOCK: ns, ...ON });
    fail = false;
    await armDigestClock({ DIGEST_CLOCK: ns, ...ON });
    await armDigestClock({ DIGEST_CLOCK: ns, ...ON });
  } finally {
    console.warn = warn;
  }
  assert.equal(fetches, 2);
});
