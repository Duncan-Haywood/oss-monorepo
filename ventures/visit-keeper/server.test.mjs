import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import vm from "node:vm";
import { handler, parseSites } from "./server.mjs";
import { newState } from "./stats.mjs";
import { TRACKER } from "./tracker.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const KEY = "correct-horse-battery";
const NOW = Date.parse("2026-10-15T10:00:00Z");

async function boot(over = {}) {
  const cfg = { state: newState(), sites: ["example.com", "blog.example.com"], publicSites: [], adminKey: KEY, secret: "s3cret-secret", now: () => NOW, ...over };
  const server = http.createServer(handler(cfg));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { cfg, base, close: () => new Promise((r) => server.close(r)) };
}
const beacon = (base, body, headers = {}) => fetch(`${base}/e`, { method: "POST", headers: { "user-agent": UA, "content-type": "text/plain", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const basic = { authorization: `Basic ${Buffer.from(`me:${KEY}`).toString("base64")}` };

test("a beacon is counted, answered 202, and shows on the dashboard and the API", async () => {
  const t = await boot();
  try {
    assert.equal((await beacon(t.base, { n: "pageview", u: "https://www.example.com/pricing?utm_source=hn", r: "https://news.ycombinator.com/" })).status, 202);
    const api = await (await fetch(`${t.base}/api/stats?site=example.com&days=1`, { headers: { authorization: `Bearer ${KEY}` } })).json();
    assert.deepEqual([api.totals.visitors, api.totals.views, api.sources[0].name, api.pages[0].name], [1, 1, "hn", "/pricing"]);
    const html = await (await fetch(`${t.base}/?site=example.com&days=7`, { headers: basic })).text();
    assert.match(html, /\/pricing/);
    assert.match(html, /No cookies/);
    assert.ok(!/<script/i.test(html), "dashboard ships no JavaScript");
  } finally { await t.close(); }
});

test("the same browser is one visitor, a different user agent is another", async () => {
  const t = await boot();
  try {
    for (let i = 0; i < 3; i++) await beacon(t.base, { n: "pageview", u: "https://example.com/" });
    await beacon(t.base, { n: "pageview", u: "https://example.com/" }, { "user-agent": UA.replace("130.0", "129.0") });
    const api = await (await fetch(`${t.base}/api/stats?site=example.com&days=1`, { headers: { authorization: `Bearer ${KEY}` } })).json();
    assert.deepEqual([api.totals.visitors, api.totals.views], [2, 4]);
  } finally { await t.close(); }
});

test("sites outside SITES are refused, bad bodies are 400, oversize is 413, Do Not Track is honoured", async () => {
  const t = await boot();
  try {
    assert.equal((await beacon(t.base, { n: "pageview", u: "https://evil.test/" })).status, 403);
    assert.equal((await beacon(t.base, "{nope")).status, 400);
    assert.equal((await beacon(t.base, { n: "pageview", u: "nonsense" })).status, 400);
    assert.equal((await beacon(t.base, "x".repeat(5000))).status, 413);
    assert.equal((await beacon(t.base, { n: "pageview", u: "https://example.com/" }, { dnt: "1" })).status, 202);
    assert.equal((await beacon(t.base, { n: "pageview", u: "https://example.com/" }, { "sec-gpc": "1" })).status, 202);
    assert.equal(Object.keys(t.cfg.state.sites).length, 0, "nothing was recorded");
  } finally { await t.close(); }
});

test("bots get the same 202 but are not counted", async () => {
  const t = await boot();
  try {
    assert.equal((await beacon(t.base, { n: "pageview", u: "https://example.com/" }, { "user-agent": "Googlebot/2.1" })).status, 202);
    assert.equal(t.cfg.dirty, undefined);
  } finally { await t.close(); }
});

test("rate limit answers 429 once a client exceeds the per-minute budget", async () => {
  const t = await boot({ ratePerMinute: 3 });
  try {
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await beacon(t.base, { n: "pageview", u: "https://example.com/" })).status);
    assert.deepEqual(codes, [202, 202, 202, 429, 429]);
  } finally { await t.close(); }
});

test("CORS preflight is allowed for the beacon only", async () => {
  const t = await boot();
  try {
    const r = await fetch(`${t.base}/e`, { method: "OPTIONS" });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
    assert.equal((await fetch(`${t.base}/e`)).status, 405);
  } finally { await t.close(); }
});

test("dashboard and API need the admin key; wrong keys are refused", async () => {
  const t = await boot();
  try {
    const r = await fetch(`${t.base}/`);
    assert.equal(r.status, 401);
    assert.match(r.headers.get("www-authenticate"), /Basic/);
    assert.equal((await fetch(`${t.base}/`, { headers: { authorization: `Basic ${Buffer.from("me:wrong-key-wrong").toString("base64")}` } })).status, 401);
    assert.equal((await fetch(`${t.base}/api/stats?site=example.com`)).status, 401);
    assert.equal((await fetch(`${t.base}/api/stats?site=nope.com`, { headers: { authorization: `Bearer ${KEY}` } })).status, 404);
    assert.equal((await fetch(`${t.base}/`, { headers: basic })).status, 200);
  } finally { await t.close(); }
});

test("a public share page exists only for sites in PUBLIC_SITES and exposes no other site", async () => {
  const t = await boot({ publicSites: ["blog.example.com"] });
  try {
    await beacon(t.base, { n: "pageview", u: "https://blog.example.com/post" });
    const ok = await fetch(`${t.base}/share/blog.example.com`);
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /\/post/);
    assert.equal((await fetch(`${t.base}/share/example.com`)).status, 404);
    assert.equal((await fetch(`${t.base}/api/stats?site=blog.example.com`)).status, 200, "a shared site's numbers are public");
    assert.equal((await fetch(`${t.base}/api/stats?site=example.com`)).status, 401);
  } finally { await t.close(); }
});

test("CSV export returns one row per day", async () => {
  const t = await boot();
  try {
    await beacon(t.base, { n: "pageview", u: "https://example.com/" });
    const r = await fetch(`${t.base}/api/stats.csv?site=example.com&days=3`, { headers: { authorization: `Bearer ${KEY}` } });
    assert.match(r.headers.get("content-type"), /text\/csv/);
    assert.equal((await r.text()).trim().split("\n").length, 4);
  } finally { await t.close(); }
});

test("country comes from the configured proxy header and goals credit the arrival source", async () => {
  const t = await boot();
  try {
    await beacon(t.base, { n: "pageview", u: "https://example.com/", r: "https://www.reddit.com/r/x" }, { "cf-ipcountry": "NL" });
    await beacon(t.base, { n: "signup", u: "https://example.com/thanks", v: 12 });
    const api = await (await fetch(`${t.base}/api/stats?site=example.com&days=1`, { headers: { authorization: `Bearer ${KEY}` } })).json();
    assert.equal(api.countries[0].name, "NL");
    assert.deepEqual([api.goals[0].name, api.goals[0].value, api.goals[0].bySource[0].source], ["signup", 12, "reddit.com"]);
  } finally { await t.close(); }
});

test("X-Forwarded-For is trusted only when TRUST_PROXY is on", async () => {
  const off = await boot();
  const on = await boot({ trustProxy: true });
  try {
    for (const [t, expect] of [[off, 1], [on, 2]]) {
      await beacon(t.base, { n: "pageview", u: "https://example.com/" }, { "x-forwarded-for": "9.9.9.1" });
      await beacon(t.base, { n: "pageview", u: "https://example.com/" }, { "x-forwarded-for": "9.9.9.2" });
      const api = await (await fetch(`${t.base}/api/stats?site=example.com&days=1`, { headers: { authorization: `Bearer ${KEY}` } })).json();
      assert.equal(api.totals.visitors, expect);
    }
  } finally { await off.close(); await on.close(); }
});

test("parseSites normalises, dedupes and rejects junk", () => {
  assert.deepEqual(parseSites("WWW.Example.com, example.com,blog.example.com"), ["example.com", "blog.example.com"]);
  assert.throws(() => parseSites(""), /at least one/);
  assert.throws(() => parseSites("exa mple.com"), /bad site/);
});

test("the tracker script parses, ignores localhost and Do Not Track, and posts a beacon from a real page", () => {
  const sent = [];
  const run = (loc, nav = {}) => {
    sent.length = 0;
    const win = { addEventListener() {} };
    const ctx = { document: { currentScript: { src: "https://v.example/t.js", dataset: {} }, referrer: "https://news.ycombinator.com/", visibilityState: "visible", addEventListener() {} },
      location: { hostname: loc.hostname, pathname: "/a", search: "", href: `https://${loc.hostname}/a` }, history: { pushState() {} },
      navigator: { sendBeacon: (u, b) => { sent.push(u); return true; }, ...nav }, Blob: class { constructor(p) { this.p = p; } }, window: win, addEventListener() {}, setTimeout: (f) => f(), fetch: () => Promise.resolve() };
    vm.runInNewContext(TRACKER, ctx);
    return ctx;
  };
  run({ hostname: "example.com" });
  assert.deepEqual(sent, ["https://v.example/e"]);
  run({ hostname: "localhost" }); assert.equal(sent.length, 0);
  run({ hostname: "example.com" }, { doNotTrack: "1" }); assert.equal(sent.length, 0);
  const ctx = run({ hostname: "example.com" });
  ctx.window.visitKeeper("signup", 5);
  assert.equal(sent.length, 2);
});
