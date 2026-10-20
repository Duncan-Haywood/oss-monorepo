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
  cfg.now = () => NOW + 86400000;
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
