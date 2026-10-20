import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler } from "./server.mjs";
import { newState } from "./engine.mjs";

const ADMIN = "admin-key-1234567890";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
async function boot(over = {}) {
  const state = newState(); let saves = 0;
  const cfg = { state, save() { saves++; }, adminKey: ADMIN, baseUrl: "https://go.example.com", now: () => Date.UTC(2026, 9, 15, 12), ...over };
  const srv = http.createServer(handler(cfg)); await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = (method, path, body, key = ADMIN) => fetch(base + path, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body == null ? undefined : JSON.stringify(body) });
  const hit = (slug, headers = {}) => fetch(base + "/" + slug, { redirect: "manual", headers: { "user-agent": DESKTOP, ...headers } });
  return { srv, state, call, hit, base, saves: () => saves };
}

test("health needs no key; the API refuses a wrong one", async () => {
  const { srv, base, call } = await boot();
  assert.equal((await fetch(base + "/healthz")).status, 200);
  assert.equal((await fetch(base + "/v1/links")).status, 401);
  assert.equal((await call("GET", "/v1/links", null, "nope")).status, 401);
  srv.close();
});

test("create, redirect, count, and read the stats back", async () => {
  const { srv, call, hit } = await boot();
  const c = await call("POST", "/v1/links", { url: "https://example.com/pricing", slug: "pricing", utm: { source: "news", medium: "email" } });
  assert.equal(c.status, 201);
  const made = await c.json();
  assert.equal(made.short, "https://go.example.com/pricing");
  const r = await hit("PRICING", { referer: "https://www.reddit.com/r/x/comments/1?t=secret", "x-country": "de" });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "https://example.com/pricing?utm_source=news&utm_medium=email");
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  await hit("pricing");
  await hit("pricing", { "user-agent": "Slackbot-LinkExpanding 1.0" });
  const st = await (await call("GET", "/v1/links/pricing/stats")).json();
  assert.equal(st.clicks, 2); assert.equal(st.bots, 1);
  assert.deepEqual(st.referrers.map((r) => r.name).sort(), ["direct", "reddit.com"]);
  assert.deepEqual(st.countries, [{ name: "DE", clicks: 1 }]);
  assert.doesNotMatch(JSON.stringify(st), /secret/);
  srv.close();
});

test("HEAD does not count; preview shows the target and does not count; unknown is 404", async () => {
  const { srv, call, hit, base, state } = await boot();
  await call("POST", "/v1/links", { url: "https://example.com/<b>", slug: "p" });
  assert.equal((await fetch(base + "/p", { method: "HEAD", redirect: "manual", headers: { "user-agent": DESKTOP } })).status, 302);
  const pv = await hit("p+");
  assert.equal(pv.status, 200);
  assert.match(await pv.text(), /example\.com\/%3Cb%3E/);
  assert.equal(state.links.p.clicks, 0);
  assert.equal((await hit("ghost")).status, 404);
  srv.close();
});

test("expired, click-limited and archived links answer 410", async () => {
  let t = Date.UTC(2026, 9, 15, 12);
  const { srv, call, hit } = await boot({ now: () => t });
  await call("POST", "/v1/links", { url: "https://a.com", slug: "ex", expiresAt: new Date(t + 1000).toISOString() });
  await call("POST", "/v1/links", { url: "https://b.com", slug: "one", maxClicks: 1 });
  await call("POST", "/v1/links", { url: "https://c.com", slug: "arch" });
  assert.equal((await hit("ex")).status, 302);
  t += 2000;
  assert.equal((await hit("ex")).status, 410);
  assert.equal((await hit("one")).status, 302);
  assert.equal((await hit("one", { "user-agent": DESKTOP + " " })).status, 410);
  assert.equal((await call("DELETE", "/v1/links/arch")).status, 200);
  assert.equal((await hit("arch")).status, 410);
  assert.equal((await call("PATCH", "/v1/links/arch", { archived: false })).status, 200);
  assert.equal((await hit("arch")).status, 302);
  srv.close();
});

test("bad input is refused with a reason and a taken slug is 409", async () => {
  const { srv, call } = await boot();
  assert.equal((await call("POST", "/v1/links", { url: "javascript:alert(1)" })).status, 400);
  assert.equal((await call("POST", "/v1/links", { url: "https://a.com", slug: "api" })).status, 400);
  await call("POST", "/v1/links", { url: "https://a.com", slug: "x" });
  assert.equal((await call("POST", "/v1/links", { url: "https://b.com", slug: "x" })).status, 409);
  assert.equal((await call("PATCH", "/v1/links/x", { maxClicks: 0 })).status, 400);
  assert.equal((await call("GET", "/v1/links/x/stats?from=yesterday")).status, 400);
  assert.equal((await call("GET", "/v1/links/ghost")).status, 404);
  const bad = await fetch(srv.address() && `http://127.0.0.1:${srv.address().port}/v1/links`, { method: "POST", headers: { authorization: `Bearer ${ADMIN}` }, body: "{nope" });
  assert.equal(bad.status, 400);
  srv.close();
});

test("bulk create reports each link; ALLOW_HOSTS limits destinations", async () => {
  const { srv, call } = await boot({ allowHosts: ["example.com"] });
  const r = await (await call("POST", "/v1/links/bulk", { links: [{ url: "https://example.com/a" }, { url: "https://other.org/a" }, { url: "https://www.example.com/b", slug: "b" }] })).json();
  assert.deepEqual(r.results.map((x) => x.ok), [true, false, true]);
  assert.match(r.results[1].error, /ALLOW_HOSTS/);
  assert.equal((await call("POST", "/v1/links/bulk", { links: [] })).status, 400);
  srv.close();
});

test("list filters, csv export, and root redirect", async () => {
  const { srv, call, base } = await boot({ rootRedirect: "https://example.com/" });
  await call("POST", "/v1/links", { url: "https://a.com/one", slug: "one", tags: ["launch"] });
  await call("POST", "/v1/links", { url: "https://b.com/two", slug: "two", title: "Two" });
  const l1 = await (await call("GET", "/v1/links?tag=launch")).json();
  assert.deepEqual(l1.links.map((l) => l.slug), ["one"]);
  const l2 = await (await call("GET", "/v1/links?q=b.com")).json();
  assert.deepEqual(l2.links.map((l) => l.slug), ["two"]);
  const csv = await (await call("GET", "/v1/export.csv")).text();
  assert.match(csv, /^slug,url,title/); assert.match(csv, /one,https:\/\/a\.com\/one/);
  const root = await fetch(base + "/", { redirect: "manual" });
  assert.equal(root.status, 302);
  srv.close();
});

test("the state never holds an address or a full referrer URL", async () => {
  const { srv, call, hit, state } = await boot({ trustProxy: true });
  await call("POST", "/v1/links", { url: "https://a.com", slug: "s" });
  await hit("s", { "x-forwarded-for": "203.0.113.77", referer: "https://news.example/story?id=42" });
  const dump = JSON.stringify(state);
  assert.doesNotMatch(dump, /203\.0\.113|story|id=42|Windows/);
  assert.match(dump, /news\.example/);
  srv.close();
});
