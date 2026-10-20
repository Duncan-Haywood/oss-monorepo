import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import vm from "node:vm";
import { handler, newState } from "./server.mjs";
import { widgetSource } from "./widget.mjs";

async function boot(over = {}) {
  const notes = [];
  const cfg = { state: newState(), save() {}, adminKey: "adm", ipSecret: "s", publicUrl: "https://p.example", company: "Acme", notify: async (m) => { notes.push(m); }, now: () => Date.UTC(2026, 9, 15), ...over };
  const server = http.createServer(handler(cfg));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = (path, body, method) => fetch(base + path, { method: method || (body ? "POST" : "GET"), headers: { authorization: "Bearer adm" }, body: body ? JSON.stringify(body) : undefined });
  const form = (slug, fields) => fetch(`${base}/t/${slug}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });
  return { cfg, base, admin, form, notes, close: () => { server.close(); server.closeAllConnections?.(); } };
}
const good = { name: "Ada", text: "This saved our team a whole week every month.", consent: "on" };

test("admin API needs the key", async () => {
  const s = await boot();
  assert.equal((await fetch(`${s.base}/v1/summary`)).status, 401);
  assert.equal((await fetch(`${s.base}/v1/testimonials.csv`, { headers: { authorization: "Bearer x" } })).status, 401);
  assert.equal((await fetch(`${s.base}/v1/testimonials/ab`, { method: "DELETE" })).status, 401);
  s.close();
});

test("end to end: create form → collect → pending is invisible → approve → public wall → hide", async () => {
  const s = await boot();
  const f = await (await s.admin("/v1/forms", { slug: "main", title: "Tell us" })).json();
  assert.equal(f.collectUrl, "https://p.example/t/main"); assert.match(f.embed, /embed\.js" data-form="main"/);
  const page = await fetch(`${s.base}/t/main`);
  assert.equal(page.status, 200); assert.match(page.headers.get("content-security-policy"), /form-action 'self'/);
  assert.match(await page.text(), /Tell us/);
  const posted = await s.form("main", { ...good, email: "ada@example.com", rating: "5" });
  assert.equal(posted.status, 200); assert.match(await posted.text(), /Thank you/);
  assert.equal(s.notes.length, 1);
  assert.deepEqual(await (await fetch(`${s.base}/wall.json?form=main`)).json(), []);
  const [item] = await (await s.admin("/v1/testimonials")).json();
  assert.equal((await s.admin(`/v1/testimonials/${item.id}/status`, { status: "approved" })).status, 200);
  const wallRes = await fetch(`${s.base}/wall.json?form=main`);
  assert.equal(wallRes.headers.get("access-control-allow-origin"), "*");
  const wall = await wallRes.json();
  assert.equal(wall.length, 1); assert.equal(wall[0].name, "Ada"); assert.ok(!JSON.stringify(wall).includes("ada@example.com"));
  assert.equal((await (await s.admin("/v1/summary")).json()).approved, 1);
  assert.match(await (await s.admin("/v1/testimonials.csv")).text(), /Ada/);
  await s.admin(`/v1/testimonials/${item.id}/status`, { status: "hidden" });
  assert.deepEqual(await (await fetch(`${s.base}/wall.json?form=main`)).json(), []);
  assert.equal((await s.admin(`/v1/testimonials/${item.id}`, null, "DELETE")).status, 200);
  s.close();
});

test("a failed submission re-renders the form with the error; no consent means no record", async () => {
  const s = await boot();
  await s.admin("/v1/forms", { slug: "main" });
  const r = await s.form("main", { name: "Ada", text: "This saved our team a whole week every month." });
  assert.equal(r.status, 400); assert.match(await r.text(), /tick the box/);
  assert.equal(s.cfg.state.items.length, 0);
  assert.equal((await fetch(`${s.base}/t/nope`)).status, 404);
  s.close();
});

test("honeypot submissions look successful but store nothing", async () => {
  const s = await boot();
  await s.admin("/v1/forms", { slug: "main" });
  const r = await s.form("main", { ...good, website: "http://spam.example" });
  assert.equal(r.status, 200); assert.equal(s.cfg.state.items.length, 0); assert.equal(s.notes.length, 0);
  s.close();
});

test("stored HTML in a testimonial is escaped on every page and never executed in the widget", async () => {
  const s = await boot();
  await s.admin("/v1/forms", { slug: "main" });
  await s.form("main", { ...good, name: "<img src=x onerror=alert(1)>" });
  const [item] = s.cfg.state.items;
  await s.admin(`/v1/testimonials/${item.id}/status`, { status: "approved" });
  const wall = await (await fetch(`${s.base}/wall.json`)).json();
  assert.equal(wall[0].name, "<img src=x onerror=alert(1)>", "data stays data; JSON is not HTML");
  // run the widget against a fake DOM and prove it only ever uses textContent
  const made = [];
  const mkEl = (tag) => { const e = { tag, children: [], style: {}, setAttribute() {}, appendChild(c) { this.children.push(c); return c; }, set innerHTML(v) { throw new Error("innerHTML used"); } }; made.push(e); return e; };
  const doc = { currentScript: { src: `${s.base}/embed.js`, getAttribute: (k) => ({ "data-form": "main" })[k] || null, parentNode: { insertBefore() {} }, nextSibling: null }, createElement: mkEl };
  const ctx = vm.createContext({ document: doc, URL, encodeURIComponent, Math, Number, fetch: async () => ({ json: async () => wall }) });
  doc.createElement = (t) => { const e = mkEl(t); if (t === "div") e.attachShadow = () => mkEl("shadow"); return e; };
  vm.runInContext(widgetSource(), ctx);
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(made.some((e) => e.textContent === "<img src=x onerror=alert(1)>"));
  s.close();
});

test("admin page is served with a script-capable CSP, the form page without scripts", async () => {
  const s = await boot();
  await s.admin("/v1/forms", { slug: "main" });
  assert.match((await fetch(`${s.base}/admin`)).headers.get("content-security-policy"), /script-src 'unsafe-inline'/);
  assert.ok(!/script-src/.test((await fetch(`${s.base}/t/main`)).headers.get("content-security-policy")));
  assert.match(await (await fetch(`${s.base}/embed.js`)).text(), /attachShadow/);
  s.close();
});

test("bad JSON is a 400 and unknown routes 404", async () => {
  const s = await boot();
  assert.equal((await fetch(`${s.base}/v1/forms`, { method: "POST", headers: { authorization: "Bearer adm" }, body: "{x" })).status, 400);
  assert.equal((await fetch(`${s.base}/nothing`)).status, 404);
  assert.equal((await s.admin("/v1/forms", { slug: "!!" })).status, 400);
  s.close();
});
