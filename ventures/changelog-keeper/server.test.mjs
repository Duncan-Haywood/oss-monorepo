import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import vm from "node:vm";
import { handler, newState } from "./server.mjs";
import { widgetSource } from "./widget.mjs";

async function boot() {
  const cfg = { state: newState(), save() {}, adminKey: "adm", publicUrl: "https://c.example", company: "Acme", now: () => Date.UTC(2026, 9, 15) };
  const server = http.createServer(handler(cfg));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = (path, body, method) => fetch(base + path, { method: method || (body ? "POST" : "GET"), headers: { authorization: "Bearer adm" }, body: body ? JSON.stringify(body) : undefined });
  return { base, admin, close: () => { server.close(); server.closeAllConnections?.(); } };
}

test("admin API needs the key", async () => {
  const s = await boot();
  assert.equal((await fetch(`${s.base}/v1/summary`)).status, 401);
  assert.equal((await fetch(`${s.base}/v1/entries`, { method: "POST", body: "{}" })).status, 401);
  assert.equal((await fetch(`${s.base}/v1/entries/ab`, { method: "DELETE" })).status, 401);
  s.close();
});

test("end to end: draft is invisible, publish shows it on page, entry page, JSON, RSS and feed; unpublish hides it", async () => {
  const s = await boot();
  const e = await (await s.admin("/v1/entries", { title: "Dark mode", body: "- **Dark** theme\n- `Ctrl+D` toggles", category: "new", tags: "ui" })).json();
  assert.equal(e.status, "draft");
  assert.match(await (await fetch(`${s.base}/`)).text(), /Nothing published yet/);
  assert.equal((await fetch(`${s.base}/e/dark-mode`)).status, 404);
  assert.deepEqual(await (await fetch(`${s.base}/changelog.json`)).json(), []);

  assert.equal((await s.admin(`/v1/entries/${e.id}/status`, { status: "published" })).status, 200);
  const page = await fetch(`${s.base}/`);
  assert.match(page.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(await page.text(), /<strong>Dark<\/strong> theme/);
  assert.match(await (await fetch(`${s.base}/e/dark-mode`)).text(), /Dark mode — Acme/);
  const j = await fetch(`${s.base}/changelog.json?tag=ui`);
  assert.equal(j.headers.get("access-control-allow-origin"), "*");
  const [item] = await j.json(); assert.equal(item.slug, "dark-mode"); assert.ok(!("id" in item) && !("status" in item));
  assert.deepEqual(await (await fetch(`${s.base}/changelog.json?tag=other`)).json(), []);
  assert.match(await (await fetch(`${s.base}/feed.xml`)).text(), /<link>https:\/\/c\.example\/e\/dark-mode<\/link>/);
  assert.equal((await (await fetch(`${s.base}/feed.json`)).json()).items.length, 1);
  assert.equal((await (await s.admin("/v1/summary")).json()).published, 1);

  await s.admin(`/v1/entries/${e.id}/status`, { status: "draft" });
  assert.deepEqual(await (await fetch(`${s.base}/changelog.json`)).json(), []);
  assert.equal((await s.admin(`/v1/entries/${e.id}`, { title: "Renamed" }, "PATCH")).status, 200);
  assert.equal((await s.admin(`/v1/entries/${e.id}`, null, "DELETE")).status, 200);
  assert.equal((await s.admin(`/v1/entries/${e.id}`, null, "DELETE")).status, 404);
  s.close();
});

test("bad input gets 400, not 500", async () => {
  const s = await boot();
  assert.equal((await s.admin("/v1/entries", { title: "", body: "x" })).status, 400);
  const bad = await fetch(`${s.base}/v1/entries`, { method: "POST", headers: { authorization: "Bearer adm" }, body: "{nope" });
  assert.equal(bad.status, 400);
  const e = await (await s.admin("/v1/entries", { title: "Title", body: "b" })).json();
  assert.equal((await s.admin(`/v1/entries/${e.id}/status`, { status: "published", publishedAt: "2999-01-01" })).status, 400);
  assert.equal((await fetch(`${s.base}/nope`)).status, 404);
  s.close();
});

test("a hostile entry cannot execute on the public page", async () => {
  const s = await boot();
  const e = await (await s.admin("/v1/entries", { title: "<img src=x onerror=alert(1)>", body: "<script>alert(1)</script> [x](javascript:alert(1))" })).json();
  await s.admin(`/v1/entries/${e.id}/status`, { status: "published" });
  const h = await (await fetch(`${s.base}/`)).text();
  assert.ok(!h.includes("<script>") && !h.includes("<img") && !/href="javascript/.test(h));
  s.close();
});

test("admin page: key typed in, list built with textContent", async () => {
  const s = await boot();
  const r = await fetch(`${s.base}/admin`); const h = await r.text();
  assert.match(r.headers.get("content-security-policy"), /connect-src 'self'/);
  assert.match(h, /type="password"/); assert.ok(!/innerHTML/.test(h) && !h.includes("adm\""));
  s.close();
});

test("widget script runs in a sandbox, shows a dot until opened, and renders entries as text", async () => {
  const items = [{ slug: "a", title: "<b>x</b>", category: "new", publishedAt: "2026-10-01T00:00:00.000Z" }];
  const store = {};
  const mkEl = () => { const el = { children: [], style: {}, dataset: {}, hidden: false, listeners: {}, append(...c) { this.children.push(...c); }, setAttribute() {}, addEventListener(t, f) { this.listeners[t] = f; }, insertAdjacentElement() {}, attachShadow() { return mkEl(); } }; let t = ""; Object.defineProperty(el, "textContent", { get: () => t, set: (v) => { t = v; } }); return el; };
  const script = Object.assign(mkEl(), { src: "https://c.example/embed.js" });
  const made = [];
  const ctx = { document: { currentScript: script, createElement: () => { const e = mkEl(); made.push(e); return e; } }, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, fetch: async () => ({ json: async () => items }), URL, encodeURIComponent, Date, Number, String };
  vm.runInNewContext(widgetSource(), ctx);
  await new Promise((r) => setImmediate(r));
  const dot = made.find((e) => e.className === "dot"), btn = made.find((e) => e.className === "b"), title = made.find((e) => e.textContent === "<b>x</b>");
  assert.ok(title, "title set via textContent"); assert.equal(dot.hidden, false);
  btn.listeners.click();
  assert.equal(dot.hidden, true); assert.ok(Object.values(store)[0] > 0);
  assert.ok(!widgetSource().includes("innerHTML"));
});
