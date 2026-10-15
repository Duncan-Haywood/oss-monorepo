import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, adminOk, limiter } from "./server.mjs";
import { newState } from "./board.mjs";

async function boot(o = {}) {
  const state = newState(); let t = Date.UTC(2026, 0, 1); const pings = [], mails = [];
  const cfg = { state, save() {}, adminKey: "admin-key-1234", company: "Acme", tagline: "Tell us", homepage: "https://example.com", now: () => t, notify: (m) => pings.push(m), dryRun: false, sendEmail: async (m) => mails.push(m), ...o };
  const srv = http.createServer(handler(cfg)); await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const jar = {};
  const call = async (path, { method = "GET", body, headers = {}, form, who = "a" } = {}) => {
    const h = { ...headers }; if (jar[who]) h.cookie = jar[who];
    let b; if (body !== undefined) { h["content-type"] = "application/json"; b = JSON.stringify(body); } else if (form) { h["content-type"] = "application/x-www-form-urlencoded"; b = new URLSearchParams(form).toString(); }
    const r = await fetch(base + path, { method, headers: h, body: b, redirect: "manual" });
    const sc = r.headers.get("set-cookie"); if (sc) jar[who] = sc.split(";")[0];
    const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = null; }
    return { status: r.status, text, json: j, headers: r.headers };
  };
  return { cfg, call, pings, mails, close: () => srv.close(), tick: (ms) => { t += ms; } };
}
const adm = { authorization: "Bearer admin-key-1234" };

test("submit, vote once per visitor, toggle off, and the board ranks it", async () => {
  const s = await boot();
  const r = await s.call("/posts", { method: "POST", body: { title: "Export to CSV", body: "for finance" } });
  assert.equal(r.json.ok, true);
  assert.equal(s.pings.length, 1);
  assert.equal((await s.call("/p/p1/vote", { method: "POST", body: {}, who: "b" })).json.count, 2);
  assert.equal((await s.call("/p/p1/vote", { method: "POST", body: {}, who: "b" })).json.count, 1, "second click removes the vote");
  assert.match((await s.call("/")).text, /Export to CSV/);
  s.close();
});

test("form posts redirect, and text is escaped", async () => {
  const s = await boot();
  const r = await s.call("/posts", { method: "POST", form: { title: "<script>alert(1)</script> idea", body: "<img src=x onerror=1>" } });
  assert.equal(r.status, 303); assert.equal(r.headers.get("location"), "/p/p1");
  const page = (await s.call("/p/p1")).text;
  assert.ok(!page.includes("<script>alert(1)") && !page.includes("<img src=x"));
  assert.match(page, /&lt;script&gt;/);
  s.close();
});

test("honeypot posts are dropped silently; short titles are 400", async () => {
  const s = await boot();
  assert.equal((await s.call("/posts", { method: "POST", body: { title: "Spam spam spam", website: "http://x" } })).json.ok, true);
  assert.equal(Object.keys(s.cfg.state.posts).length, 0);
  assert.equal((await s.call("/posts", { method: "POST", body: { title: "no" } })).status, 400);
  s.close();
});

test("posting is rate limited per address", async () => {
  const s = await boot();
  for (let i = 0; i < 5; i++) assert.equal((await s.call("/posts", { method: "POST", body: { title: `Idea number ${i}` } })).status, 200);
  assert.equal((await s.call("/posts", { method: "POST", body: { title: "One too many" } })).status, 429);
  s.tick(3_600_000);
  assert.equal((await s.call("/posts", { method: "POST", body: { title: "After the window" } })).status, 200);
  s.close();
});

test("admin routes need the key; Basic and Bearer both work; wrong key is refused", async () => {
  const s = await boot();
  await s.call("/posts", { method: "POST", body: { title: "A decent idea" } });
  assert.equal((await s.call("/admin")).status, 401);
  assert.equal((await s.call("/admin/p/p1/status", { method: "POST", body: { status: "planned" } })).status, 401);
  assert.equal((await s.call("/admin", { headers: { authorization: "Bearer nope-nope-nope" } })).status, 401);
  assert.equal((await s.call("/admin", { headers: { authorization: `Basic ${Buffer.from("me:admin-key-1234").toString("base64")}` } })).status, 200);
  assert.equal((await s.call("/admin/p/p1/status", { method: "POST", body: { status: "planned" }, headers: adm })).json.ok, true);
  assert.match((await s.call("/roadmap")).text, /A decent idea/);
  s.close();
});

test("a cross-site form cannot use cached Basic credentials", async () => {
  const s = await boot();
  await s.call("/posts", { method: "POST", body: { title: "A decent idea" } });
  const basic = { authorization: `Basic ${Buffer.from("me:admin-key-1234").toString("base64")}` };
  const r = await s.call("/admin/p/p1/delete", { method: "POST", form: {}, headers: { ...basic, origin: "https://evil.example" } });
  assert.equal(r.status, 403);
  assert.ok(s.cfg.state.posts.p1);
  s.close();
});

test("shipping emails the author once; dry run sends nothing", async () => {
  const s = await boot();
  await s.call("/posts", { method: "POST", body: { title: "Dark mode please", email: "Fan@Example.com" } });
  for (let i = 0; i < 2; i++) await s.call("/admin/p/p1/status", { method: "POST", body: { status: "shipped" }, headers: adm });
  assert.equal(s.mails.length, 1);
  assert.equal(s.mails[0].to, "fan@example.com");
  s.close();
  const d = await boot({ dryRun: true });
  await d.call("/posts", { method: "POST", body: { title: "Dark mode please", email: "fan@example.com" } });
  await d.call("/admin/p/p1/status", { method: "POST", body: { status: "shipped" }, headers: adm });
  assert.equal(d.mails.length, 0);
  d.close();
});

test("admin merges a duplicate, the old link redirects, changelog publishes to page, RSS and API", async () => {
  const s = await boot();
  await s.call("/posts", { method: "POST", body: { title: "CSV export" } });
  await s.call("/posts", { method: "POST", body: { title: "Export as CSV" }, who: "b" });
  await s.call("/admin/p/p2/status", { method: "POST", body: { mergeInto: "p1" }, headers: adm });
  assert.equal((await s.call("/p/p2")).headers.get("location"), "/p/p1");
  assert.equal(s.cfg.state.posts.p1.votes.length, 2);
  await s.call("/admin/changelog", { method: "POST", body: { title: "CSV export is live <3", body: "Reports → Export", tags: "new, reports", date: "2026-02-01" }, headers: adm });
  assert.match((await s.call("/changelog")).text, /CSV export is live/);
  const feed = (await s.call("/changelog.rss")).text;
  assert.match(feed, /<rss version="2.0">/); assert.match(feed, /&lt;3/);
  assert.equal((await s.call("/api/changelog")).json[0].tags[1], "reports");
  assert.match((await s.call("/widget.js")).text, /What\\u2019s new/);
  s.close();
});

test("similar endpoint warns about duplicates while typing", async () => {
  const s = await boot();
  await s.call("/posts", { method: "POST", body: { title: "Export reports to CSV" } });
  const r = await s.call("/api/similar?q=" + encodeURIComponent("csv export of reports"));
  assert.equal(r.json[0].id, "p1");
  assert.deepEqual((await s.call("/api/similar?q=pizza")).json, []);
  s.close();
});

test("security headers and the voter cookie flags", async () => {
  const s = await boot({ secure: true });
  const r = await s.call("/");
  assert.match(r.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  assert.match(r.headers.get("set-cookie"), /Secure/);
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  s.close();
});

test("adminOk and limiter units", () => {
  assert.equal(adminOk({ headers: {} }, "k"), false);
  assert.equal(adminOk({ headers: { authorization: "Bearer k" } }, ""), false);
  const l = limiter(2, 1000);
  assert.deepEqual([l("a", 0), l("a", 1), l("a", 2), l("a", 1000)], [true, true, false, true]);
});
