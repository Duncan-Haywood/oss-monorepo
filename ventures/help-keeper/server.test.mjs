import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler } from "./server.mjs";
import { newState, saveArticle, updateSettings } from "./kb.mjs";

const KEY = "k".repeat(16);
async function boot(over = {}) {
  const state = newState(); let t = 1_000_000, saves = 0;
  updateSettings(state, { name: "Acme <i>Help</i>", contact: "help@acme.test" });
  saveArticle(state, { title: "Reset your password", body: "# Steps\n\nUse the **reset link** on the login page.\n\n## Still locked out\n\nEmail us.\n\n### Details\n\nmore\n\n## Last\n\nend", collection: "Account", status: "published", tags: "login" }, t);
  saveArticle(state, { title: "Invoices", body: "Download invoices from Settings. <script>alert(1)</script>", collection: "Billing", status: "published" }, t);
  saveArticle(state, { title: "Draft thing", body: "Secret wombats.", status: "draft" }, t);
  const cfg = { state, save() { saves++; }, adminKey: KEY, sponsor: true, now: () => t, ...over };
  const server = http.createServer(handler(cfg)); await new Promise((r) => server.listen(0, r));
  return { base: `http://127.0.0.1:${server.address().port}`, state, cfg, saves: () => saves, close: () => server.close() };
}
const auth = { authorization: `Bearer ${KEY}` };
const form = (url, body, headers = {}) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(body).toString() });

test("home, collection and article pages render; names and bodies are escaped; drafts are 404", async () => {
  const s = await boot();
  const home = await (await fetch(`${s.base}/`)).text();
  assert.match(home, /Acme &lt;i&gt;Help&lt;\/i&gt;/); assert.match(home, /Reset your password/); assert.doesNotMatch(home, /Draft thing/);
  const art = await fetch(`${s.base}/a/invoices`); const html = await art.text();
  assert.equal(art.status, 200); assert.doesNotMatch(html, /<script>alert/); assert.match(html, /&lt;script&gt;/); assert.match(html, /"@type":"Article"/);
  assert.match(html, /Contact us/); assert.match(art.headers.get("content-security-policy"), /default-src 'none'/); assert.doesNotMatch(art.headers.get("content-security-policy"), /script-src/);
  assert.equal((await fetch(`${s.base}/a/draft-thing`)).status, 404);
  assert.match(await (await fetch(`${s.base}/c/account`)).text(), /Reset your password/); assert.equal((await fetch(`${s.base}/c/nope`)).status, 404);
  const pw = await (await fetch(`${s.base}/a/reset-your-password`)).text(); assert.match(pw, /On this page/); assert.match(pw, /href="#still-locked-out"/);
  s.close();
});

test("search finds, tolerates typos, highlights safely, and logs what found nothing", async () => {
  const s = await boot();
  const r = await (await fetch(`${s.base}/search?q=pasword`)).text(); assert.match(r, /Reset your password/);
  assert.match(await (await fetch(`${s.base}/search?q=<b>zzqq</b>`)).text(), /Nothing matched <b>&lt;b&gt;zzqq&lt;\/b&gt;<\/b>/);
  await fetch(`${s.base}/search?q=dark+mode`); await fetch(`${s.base}/search?q=dark+mode`);
  assert.equal(s.state.queries["dark mode"].zero, 2); assert.equal(s.state.queries["dark mode"].n, 2);
  assert.match(await (await fetch(`${s.base}/search?q=wombats`)).text(), /Nothing matched/, "draft text is not searchable");
  const j = await fetch(`${s.base}/api/search?q=invoice`); assert.equal(j.headers.get("access-control-allow-origin"), "*");
  const body = await j.json(); assert.equal(body.results[0].title, "Invoices"); assert.match(body.results[0].url, /\/a\/invoices\?from=invoice$/);
  s.close();
});

test("opening a result from search counts as a click; votes are stored and rate limited", async () => {
  const s = await boot({ limits: { vote: (() => { let n = 0; return () => ++n <= 2; })() } });
  await fetch(`${s.base}/search?q=invoice`); await fetch(`${s.base}/a/invoices?from=invoice`);
  assert.equal(s.state.queries.invoice.clicks, 1); assert.equal(Object.values(s.state.articles).find((a) => a.slug === "invoices").views, 1);
  const v = await form(`${s.base}/a/invoices/vote`, { helpful: "no", comment: "missing VAT" }); assert.equal(v.status, 303);
  await form(`${s.base}/a/invoices/vote`, { helpful: "yes" });
  const a = Object.values(s.state.articles).find((x) => x.slug === "invoices"); assert.deepEqual([a.yes, a.no], [1, 1]); assert.equal(s.state.feedback[0].comment, "missing VAT");
  assert.equal((await form(`${s.base}/a/invoices/vote`, { helpful: "yes" })).status, 429);
  assert.equal((await form(`${s.base}/a/draft-thing/vote`, { helpful: "yes" })).status, 404);
  s.close();
});

test("view counting is throttled per reader", async () => {
  const s = await boot();
  for (let i = 0; i < 6; i++) await fetch(`${s.base}/a/invoices`);
  assert.equal(Object.values(s.state.articles).find((a) => a.slug === "invoices").views, 3);
  s.close();
});

test("sitemap lists published articles only; robots keeps search and admin out", async () => {
  const s = await boot();
  const sm = await (await fetch(`${s.base}/sitemap.xml`)).text(); assert.match(sm, /\/a\/invoices</); assert.doesNotMatch(sm, /draft-thing/);
  const rb = await (await fetch(`${s.base}/robots.txt`)).text(); assert.match(rb, /Disallow: \/admin/); assert.match(rb, /Disallow: \/search/);
  assert.match(await (await fetch(`${s.base}/search?q=x`)).text(), /name="robots" content="noindex"/);
  s.close();
});

test("admin needs the key; writing, preview of drafts, gaps and CSV work", async () => {
  const s = await boot();
  assert.equal((await fetch(`${s.base}/admin`)).status, 401); assert.equal((await fetch(`${s.base}/admin/gaps`, { headers: { authorization: "Bearer nope" } })).status, 401);
  assert.equal((await form(`${s.base}/admin/save`, { title: "Dark mode", body: "# Dark mode\n\nSettings, Theme.", status: "published", collection: "Account" }, auth)).status, 303);
  assert.match(await (await fetch(`${s.base}/search?q=dark+mode`)).text(), /Dark mode/);
  const bad = await form(`${s.base}/admin/save`, { title: "", body: "x" }, auth); assert.equal(bad.status, 400); assert.match(await bad.text(), /give the article a title/);
  const draft = Object.values(s.state.articles).find((a) => a.slug === "draft-thing");
  const prev = await fetch(`${s.base}/admin/preview/${draft.id}`, { headers: auth }); const ph = await prev.text(); assert.match(ph, /this draft is not public/); assert.match(ph, /noindex/);
  await fetch(`${s.base}/search?q=refund+policy`);
  const gaps = await (await fetch(`${s.base}/admin/gaps`, { headers: auth })).text(); assert.match(gaps, /refund policy/); assert.match(gaps, /Write it/);
  assert.match(await (await fetch(`${s.base}/admin/gaps.csv`, { headers: auth })).text(), /refund policy,1,1,0,no results/);
  const exp = await (await fetch(`${s.base}/admin/export.json`, { headers: auth })).json(); assert.equal(exp.articles.length, 4);
  assert.equal((await form(`${s.base}/admin/a/${draft.id}/delete`, {}, auth)).status, 303); assert.ok(!s.state.articles[draft.id]);
  assert.equal((await form(`${s.base}/admin/settings`, { name: "X", contact: "javascript:alert(1)" }, auth)).status, 400);
  assert.equal((await form(`${s.base}/admin/import`, { text: "# Imported\n\nHello" }, auth)).status, 200); assert.ok(Object.values(s.state.articles).some((a) => a.title === "Imported"));
  s.close();
});

test("a cross-site admin post riding browser credentials is refused", async () => {
  const s = await boot();
  const basic = { authorization: `Basic ${Buffer.from(`a:${KEY}`).toString("base64")}`, origin: "https://evil.example" };
  assert.equal((await form(`${s.base}/admin/save`, { title: "x", body: "y" }, basic)).status, 403);
  s.close();
});

test("searches are persisted without hammering the disk, and flushed on demand", async () => {
  const s = await boot();
  const before = s.saves();
  for (let i = 0; i < 5; i++) await fetch(`${s.base}/search?q=thing${i}`);
  assert.ok(s.saves() - before <= 1); s.cfg.flush(); assert.ok(s.saves() - before <= 2);
  s.close();
});
