import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, newState, sync, authorized } from "./server.mjs";

const NOW = Date.UTC(2026, 9, 15);
const D = (y, m, d) => Date.UTC(y, m - 1, d);
const line = (id, amount, start, end, extra = {}) => ({ id, billedAt: start, start, end, amount, currency: "usd", ...extra });
function setup(over = {}) {
  const feed = { lines: [], notes: [], sinces: [] };
  const cfg = { state: newState(), save() {}, stripe: { listLines: async (s) => (feed.sinces.push(s), feed.lines), listCreditNotes: async () => feed.notes }, adminKey: "correct-horse-battery", company: "Acme <script>alert(1)</script>", now: () => NOW, ...over };
  return { cfg, feed };
}
const listen = (cfg) => new Promise((resolve) => { const s = http.createServer(handler(cfg)).listen(0, () => resolve({ s, url: `http://127.0.0.1:${s.address().port}` })); });
const AUTH = { authorization: "Bearer correct-horse-battery" };

test("authorized accepts bearer or basic with the key only", () => {
  const k = "correct-horse-battery";
  assert.ok(authorized(`Bearer ${k}`, k));
  assert.ok(authorized(`Basic ${Buffer.from(`me:${k}`).toString("base64")}`, k));
  assert.ok(!authorized(`Basic ${Buffer.from("me:nope").toString("base64")}`, k));
  assert.ok(!authorized(undefined, k)); assert.ok(!authorized(`Bearer ${k}`, ""));
});

test("sync: first pass reads everything, later passes ask only for recent records and do not duplicate", async () => {
  const { cfg, feed } = setup();
  feed.lines = [line("a", 12000, D(2026, 1, 1), D(2027, 1, 1))];
  const r = await sync(cfg);
  assert.equal(r.lines, 1);
  assert.equal(feed.sinces[0], 0);
  cfg.now = () => NOW + 6 * 3600000;
  feed.lines = [line("a", 12000, D(2026, 1, 1), D(2027, 1, 1)), line("b", 500, D(2026, 10, 1), D(2026, 11, 1))];
  const r2 = await sync(cfg);
  assert.equal(r2.lines, 2);
  assert.ok(feed.sinces[1] > 0 && feed.sinces[1] * 1000 < NOW);
});

test("sync: keeps the most common currency and counts the rest as left out", async () => {
  const { cfg, feed } = setup();
  feed.lines = [line("a", 100, D(2026, 9, 1), D(2026, 10, 1)), line("b", 100, D(2026, 9, 1), D(2026, 10, 1)), line("c", 100, D(2026, 9, 1), D(2026, 10, 1), { currency: "eur" })];
  const r = await sync(cfg);
  assert.equal(cfg.state.currency, "usd");
  assert.equal(r.skipped, 1);
});

test("routes: auth, escaped dashboard, schedule JSON, journal CSV, sync, 404", async () => {
  const { cfg, feed } = setup();
  feed.lines = [line("a", 36500, D(2026, 1, 1), D(2027, 1, 1))];
  await sync(cfg);
  const { s, url } = await listen(cfg);
  try {
    assert.equal((await fetch(`${url}/healthz`)).status, 200);
    const noauth = await fetch(`${url}/`);
    assert.equal(noauth.status, 401);
    assert.match(noauth.headers.get("www-authenticate"), /Basic/);
    const page = await (await fetch(`${url}/`, { headers: AUTH })).text();
    assert.ok(!page.includes("<script>alert(1)"));
    assert.match(page, /Deferred revenue now/);
    const sched = await (await fetch(`${url}/v1/schedule`, { headers: AUTH })).json();
    assert.equal(sched.months[0].month, "2026-01");
    const csvRes = await fetch(`${url}/v1/journal.csv?through=2026-03`, { headers: AUTH });
    assert.match(csvRes.headers.get("content-type"), /text\/csv/);
    const csv = await csvRes.text();
    assert.match(csv, /Billings 2026-01/);
    assert.ok(!csv.includes("2026-04"));
    assert.equal((await fetch(`${url}/v1/sync`, { method: "POST", headers: AUTH })).status, 200);
    assert.equal((await fetch(`${url}/nope`, { headers: AUTH })).status, 404);
  } finally { s.close(); }
});

// Red team 2026-11-18: ?through= was compared as text, so "2026-3" or "March" exported every month.
test("journal.csv: a malformed through is a 400, not a journal of every month", async () => {
  const { cfg, feed } = setup();
  feed.lines = [line("a", 36500, D(2026, 1, 1), D(2027, 1, 1))];
  await sync(cfg);
  const { s, url } = await listen(cfg);
  try {
    for (const t of ["2026-3", "March", "2026-13", "2026-03-31"]) {
      const res = await fetch(`${url}/v1/journal.csv?through=${t}`, { headers: AUTH });
      assert.equal(res.status, 400, t);
      assert.ok(!(await res.text()).includes("Billings"), t);
    }
    const ok = await (await fetch(`${url}/v1/journal.csv?through=2026-01`, { headers: AUTH })).text();
    assert.match(ok, /Billings 2026-01/);
    assert.ok(!ok.includes("2026-02"));
  } finally { s.close(); }
});

test("a Stripe failure surfaces as a generic error, not the key or the message", async () => {
  const { cfg } = setup();
  cfg.stripe.listLines = async () => { throw Object.assign(new Error("Invalid API Key provided: rk_live_secret"), { status: 401 }); };
  const { s, url } = await listen(cfg);
  try {
    const res = await fetch(`${url}/v1/sync`, { method: "POST", headers: AUTH });
    assert.equal(res.status, 502);
    assert.ok(!(await res.text()).includes("rk_live"));
  } finally { s.close(); }
});

// Stripe lists invoices by `created` only, so a later pass asking for "created in the
// last 3 days" never sees an invoice issued earlier and paid today (net-30 terms), and
// never drops a credit note voided after it was read. A periodic full re-read rebuilds
// the line set (red team 2026-11-18).
test("sync: an invoice paid after the incremental window, and a voided credit note, are corrected by the daily full re-read", async () => {
  const H = 3600000;
  const { cfg } = setup();
  const invoices = [{ ...line("old", 1000, D(2026, 9, 1), D(2026, 10, 1)), created: NOW - 20 * 86400000, paid: false }];
  let notes = [line("cn:1", -300, NOW, NOW)];
  cfg.stripe = {
    listLines: async (since) => invoices.filter((l) => l.paid && l.created >= since * 1000).map(({ created, paid, ...l }) => l),
    listCreditNotes: async (since) => notes.filter((l) => l.start >= since * 1000),
  };
  await sync(cfg);
  assert.deepEqual(Object.keys(cfg.state.lines), ["cn:1"]);
  invoices[0].paid = true; notes = [];
  cfg.now = () => NOW + 6 * H;
  await sync(cfg);
  assert.ok(!cfg.state.lines.old, "an incremental pass cannot see it");
  cfg.now = () => NOW + 25 * H;
  const r = await sync(cfg);
  assert.ok(cfg.state.lines.old, "the full re-read picks up the late-paid invoice");
  assert.ok(!cfg.state.lines["cn:1"], "and drops the voided credit note");
  assert.equal(r.lines, 1);
});

test("sync: an incremental pass overlaps the previous one by exactly three days", async () => {
  const { cfg, feed } = setup();
  await sync(cfg);
  cfg.now = () => NOW + 6 * 3600000;
  await sync(cfg);
  assert.equal(feed.sinces[1], Math.floor((NOW - 3 * 86400000) / 1000));
});

test("closed_through locks closed months on the schedule and a malformed value is a 400, not a 500", async () => {
  const { cfg, feed } = setup();
  feed.lines = [line("late", 9000, D(2026, 7, 1), D(2026, 10, 1), { billedAt: D(2026, 10, 5) })];
  await sync(cfg);
  const { s, url } = await listen(cfg);
  try {
    const open = await (await fetch(`${url}/v1/schedule`, { headers: AUTH })).json();
    assert.ok(open.months.find((m) => m.month === "2026-07").recognized > 0);
    const locked = await (await fetch(`${url}/v1/schedule?closed_through=2026-09`, { headers: AUTH })).json();
    assert.equal(locked.months.find((m) => m.month === "2026-10").recognized, 9000);
    assert.ok(!locked.months.some((m) => m.month < "2026-10" && m.recognized !== 0));
    const bad = await fetch(`${url}/v1/schedule?closed_through=Sept`, { headers: AUTH });
    assert.equal(bad.status, 400);
  } finally { s.close(); }
});
