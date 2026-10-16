import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import vm from "node:vm";
import { handler, newState } from "./server.mjs";
import { widgetSource } from "./widget.mjs";

const NOW = Date.UTC(2026, 9, 15);
async function boot(over = {}) {
  const notes = [];
  const cfg = { state: newState(), save() {}, adminKey: "adm", publicUrl: "https://c.example", company: "Acme & Co", notify: async (e) => { notes.push(e.title); }, now: () => NOW, ...over };
  const server = http.createServer(handler(cfg));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = (path, body, method) => fetch(base + path, { method: method || (body ? "POST" : "GET"), headers: { authorization: "Bearer adm" }, body: body ? JSON.stringify(body) : undefined });
  return { cfg, base, admin, notes, close: () => { server.close(); server.closeAllConnections?.(); } };
}

test("admin API needs the key", async () => {
  const s = await boot();
  for (const [p, m] of [["/v1/summary", "GET"], ["/v1/entries", "GET"], ["/v1/entries", "POST"], ["/v1/entries/ab", "DELETE"]]) assert.equal((await fetch(s.base + p, { method: m })).status, 401, p);
  assert.equal((await fetch(`${s.base}/v1/entries`, { headers: { authorization: "Bearer x" } })).status, 401);
  s.close();
});

test("end to end: draft is invisible, publish shows page, feeds and widget data; scheduled waits", async () => {
  const s = await boot();
  const made = await (await s.admin("/v1/entries", { title: "Dark <mode>", body: "Switch in **settings**.", tag: "new", status: "draft" })).json();
  assert.equal(s.notes.length, 0);
  assert.match(await (await fetch(`${s.base}/changelog`)).text(), /Nothing published yet/);
  assert.deepEqual(await (await fetch(`${s.base}/entries.json`)).json(), []);
  assert.equal((await s.admin(`/v1/entries/${made.id}`, { status: "published" })).status, 200);
  const page = await fetch(`${s.base}/changelog`);
  assert.match(page.headers.get("content-security-policy"), /default-src 'none'/); assert.ok(!/script-src/.test(page.headers.get("content-security-policy")));
  const body = await page.text();
  assert.match(body, /Dark &lt;mode&gt;/); assert.match(body, /<strong>settings<\/strong>/); assert.match(body, /Acme &amp; Co changelog/); assert.ok(!body.includes("<mode>"));
  const atom = await fetch(`${s.base}/feed.xml`);
  assert.match(atom.headers.get("content-type"), /atom\+xml/); const xml = await atom.text();
  assert.match(xml, /<feed xmlns/); assert.match(xml, /\[new\] Dark &lt;mode&gt;/); assert.match(xml, /changelog#/);
  const jf = await (await fetch(`${s.base}/feed.json`)).json();
  assert.equal(jf.version, "https://jsonfeed.org/version/1.1"); assert.equal(jf.items[0].title, "Dark <mode>"); assert.equal(jf.items[0].tags[0], "new");
  const ent = await fetch(`${s.base}/entries.json`);
  assert.equal(ent.headers.get("access-control-allow-origin"), "*");
  assert.equal((await ent.json())[0].text, "Switch in settings.");
  await s.admin("/v1/entries", { title: "Launch", body: "Big day.", publishAt: "2026-11-01T09:00:00Z" });
  assert.equal((await (await fetch(`${s.base}/entries.json`)).json()).length, 1, "future entry is hidden until its date");
  assert.deepEqual(await (await s.admin("/v1/summary")).json(), { total: 2, published: 1, scheduled: 1, draft: 0, latest: NOW });
  assert.equal((await s.admin(`/v1/entries/${made.id}`, null, "DELETE")).status, 200);
  assert.equal((await s.admin(`/v1/entries/${made.id}`, null, "DELETE")).status, 404);
  s.close();
});

test("a webhook fires only for entries that are public now", async () => {
  const s = await boot();
  await s.admin("/v1/entries", { title: "Live", body: "x" });
  await s.admin("/v1/entries", { title: "Draft", body: "x", status: "draft" });
  await s.admin("/v1/entries", { title: "Later", body: "x", publishAt: "2027-01-01" });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(s.notes, ["Live"]);
  s.close();
});

test("the bell widget renders with textContent only and counts unread", async () => {
  const s = await boot();
  await s.admin("/v1/entries", { title: "<img src=x onerror=alert(1)>", body: "ok" });
  const list = await (await fetch(`${s.base}/entries.json`)).json();
  const made = [], store = {};
  const mkEl = (tag) => { const e = { tag, children: [], style: {}, listeners: {}, setAttribute() {}, appendChild(c) { this.children.push(c); return c; }, addEventListener(n, f) { this.listeners[n] = f; }, set innerHTML(v) { throw new Error("innerHTML used"); } }; made.push(e); return e; };
  const doc = { currentScript: { src: `${s.base}/embed.js`, getAttribute: () => null, parentNode: { insertBefore() {} }, nextSibling: null }, createElement: (t) => { const e = mkEl(t); if (t === "div") e.attachShadow = () => mkEl("shadow"); return e; } };
  const ctx = vm.createContext({ document: doc, URL, Math, Number, String, Array, Date, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, fetch: async () => ({ json: async () => list }) });
  vm.runInContext(widgetSource(), ctx);
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(made.some((e) => e.textContent === "<img src=x onerror=alert(1)>"));
  assert.ok(made.some((e) => e.className === "n" && e.textContent === "1"), "one unread badge");
  s.close();
});

test("admin page: script-capable CSP, noindex, textContent only; embed served; bad input handled", async () => {
  const s = await boot();
  const a = await fetch(`${s.base}/admin`); const h = await a.text();
  assert.match(a.headers.get("content-security-policy"), /script-src 'unsafe-inline'/); assert.match(h, /noindex/); assert.ok(!/innerHTML/.test(h)); assert.match(h, /type="password"/);
  assert.match(await (await fetch(`${s.base}/embed.js`)).text(), /attachShadow/);
  assert.equal((await fetch(`${s.base}/v1/entries`, { method: "POST", headers: { authorization: "Bearer adm" }, body: "{x" })).status, 400);
  assert.equal((await s.admin("/v1/entries", { title: "t" })).status, 400);
  assert.equal((await fetch(`${s.base}/nothing`)).status, 404);
  s.close();
});
