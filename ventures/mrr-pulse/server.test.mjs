import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, newState, sync, authorized } from "./server.mjs";

const NOW = Date.UTC(2026, 9, 15);
const sub = (id, mrr, status = "active", created = Date.UTC(2026, 5, 1), extra = {}) => ({ id, mrr, status, created, endedAt: null, currency: "usd", ...extra });

function setup(list, over = {}) {
  const cfg = { state: newState(), save() {}, stripe: { listSubscriptions: async () => list.current }, adminKey: "correct-horse-battery", company: 'Acme <script>alert(1)</script>', now: () => NOW, ...over };
  list.current ??= [];
  return cfg;
}
const listen = (cfg) => new Promise((resolve) => { const s = http.createServer(handler(cfg)).listen(0, () => resolve({ s, url: `http://127.0.0.1:${s.address().port}` })); });
const AUTH = { authorization: "Bearer correct-horse-battery" };

test("authorized accepts bearer or basic with the key, rejects everything else", () => {
  const k = "correct-horse-battery";
  assert.ok(authorized(`Bearer ${k}`, k));
  assert.ok(authorized(`Basic ${Buffer.from(`me:${k}`).toString("base64")}`, k));
  assert.ok(!authorized(`Basic ${Buffer.from(`me:nope`).toString("base64")}`, k));
  assert.ok(!authorized("Bearer ", k)); assert.ok(!authorized(undefined, k)); assert.ok(!authorized(`Bearer ${k}`, ""));
});

test("first sync backfills; a later sync records movement", async () => {
  const list = { current: [sub("a", 1000), sub("b", 500, "active", Date.UTC(2026, 8, 3)), sub("t", 900, "trialing")] };
  const cfg = setup(list);
  const r = await sync(cfg);
  assert.equal(r.counted, 2);
  const cur = cfg.state.months["2026-10"];
  assert.equal(cur.mrr, 1500);
  list.current = [sub("a", 1500), sub("c", 200)];
  cfg.now = () => NOW + 86400000;
  await sync(cfg);
  const row = cfg.state.months["2026-10"];
  assert.equal(row.expansion, 500); assert.equal(row.new, 200); assert.equal(row.churn, 500); assert.equal(row.mrr, 1700);
});

test("other-currency subscriptions are left out and counted", async () => {
  const cfg = setup({ current: [sub("a", 1000), sub("b", 1000), sub("e", 999, "active", Date.UTC(2026, 5, 1), { currency: "eur" })] });
  const r = await sync(cfg);
  assert.equal(r.skipped, 1); assert.equal(cfg.state.currency, "usd");
});

test("the API needs the key and the dashboard escapes the company name", async () => {
  const cfg = setup({ current: [sub("a", 1000)] });
  const { s, url } = await listen(cfg);
  try {
    assert.equal((await fetch(`${url}/healthz`)).status, 200);
    const denied = await fetch(`${url}/v1/metrics`);
    assert.equal(denied.status, 401); assert.match(denied.headers.get("www-authenticate"), /Basic/);
    assert.equal((await fetch(`${url}/v1/sync`, { method: "POST", headers: AUTH })).status, 200);
    const m = await (await fetch(`${url}/v1/metrics`, { headers: AUTH })).json();
    assert.equal(m.summary.mrr, 1000);
    const html = await (await fetch(`${url}/`, { headers: AUTH })).text();
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /<svg/);
    const co = await (await fetch(`${url}/v1/cohorts`, { headers: AUTH })).json();
    assert.ok(Array.isArray(co) && co.some((c) => c.size === 1));
    assert.match(html, /Retention by signup month/);
    const csv = await fetch(`${url}/v1/months.csv`, { headers: AUTH });
    assert.match(csv.headers.get("content-type"), /text\/csv/);
    assert.match(await csv.text(), /^# currency: .*\nmonth,mrr,customers/);
    assert.equal((await fetch(`${url}/v1/months.csv`)).status, 401);
    assert.equal((await fetch(`${url}/nope`, { headers: AUTH })).status, 404);
  } finally { s.close(); }
});

test("a Stripe failure returns a generic error, not the key or the upstream message", async () => {
  const cfg = setup({ current: [] });
  cfg.stripe = { listSubscriptions: async () => { throw Object.assign(new Error("Invalid API Key provided: rk_live_secret"), { status: 401 }); } };
  const { s, url } = await listen(cfg);
  const orig = console.error; console.error = () => {};
  try {
    const r = await fetch(`${url}/v1/sync`, { method: "POST", headers: AUTH });
    assert.equal(r.status, 502);
    assert.doesNotMatch(await r.text(), /rk_live/);
  } finally { console.error = orig; s.close(); }
});

test("sync stores a plan breakdown and /v1/plans plus the dashboard serve it", async () => {
  const list = { current: [sub("a", 1000, "active", Date.UTC(2026, 5, 1), { customer: "c1", plans: { Pro: 1000 } }), sub("b", 500, "active", Date.UTC(2026, 5, 2), { customer: "c2", plans: { Starter: 500 } })] };
  const cfg = setup(list);
  await sync(cfg);
  const { s, url } = await listen(cfg);
  try {
    const j = await (await fetch(`${url}/v1/plans`, { headers: AUTH })).json();
    assert.equal(j.total, 1500); assert.equal(j.plans[0].plan, "Pro");
    const html = await (await fetch(`${url}/`, { headers: AUTH })).text();
    assert.match(html, /MRR by plan/); assert.ok(!html.includes("c1"));
    assert.equal((await fetch(`${url}/v1/plans`)).status, 401);
  } finally { s.close(); }
});

test("/v1/concentration needs the key and returns shares without subscription ids", async () => {
  const list = { current: [sub("sub_secret1", 3000), sub("sub_secret2", 1000)] };
  const cfg = setup(list);
  await sync(cfg);
  const { s, url } = await listen(cfg);
  try {
    assert.equal((await fetch(`${url}/v1/concentration`)).status, 401);
    const r = await fetch(`${url}/v1/concentration`, { headers: AUTH });
    const body = await r.text();
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(body).top1, 0.75);
    assert.doesNotMatch(body, /sub_secret/);
    assert.match(await (await fetch(`${url}/`, { headers: AUTH })).text(), /Customer concentration/);
  } finally { s.close(); }
});
