// The installable app: manifest, icons, the offline service worker (run for real in
// a sandbox against this directory), and the self-hosted server serving all of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { handler } from "./server.mjs";
import { emptyDesk } from "./engine.mjs";

const DIR = new URL("./", import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), "utf8");
const BASE = "https://sitter.example/kit/";

test("index.html links the manifest, the touch icon and registers the service worker", () => {
  const html = read("index.html");
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="apple-touch-icon\.png">/);
  assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}">/);
  assert.match(html, /serviceWorker\.register\("sw\.js"\)/);
});

test("the manifest is installable: standalone, in scope, with a 192, a 512 and a maskable PNG that exist", () => {
  const m = JSON.parse(read("manifest.webmanifest"));
  assert.equal(m.display, "standalone");
  assert.equal(m.scope, "./");
  assert.ok(m.start_url.startsWith("./"));
  assert.ok(m.name && m.short_name.length <= 12);
  for (const i of m.icons) assert.ok(existsSync(new URL(i.src, DIR)), i.src);
  assert.ok(m.icons.some((i) => i.sizes === "192x192" && i.type === "image/png"));
  assert.ok(m.icons.some((i) => i.sizes === "512x512" && i.type === "image/png"));
  assert.ok(m.icons.some((i) => i.purpose === "maskable"));
  for (const f of ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"]) {
    const b = readFileSync(new URL(f, DIR));
    assert.equal(b.subarray(1, 4).toString(), "PNG", f);
    const [w, h] = [b.readUInt32BE(16), b.readUInt32BE(20)];
    assert.equal(w, h, f);
    assert.equal(w, Number(/\d+/.exec(f.replace("apple-touch-icon", "180"))[0]), f);
  }
});

// A service-worker global with in-memory caches and a fetch that reads this directory.
function loadWorker() {
  const listeners = {};
  const store = new Map();
  const net = { online: true };
  const fetchImpl = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    if (!net.online || !url.startsWith(BASE)) throw new TypeError("Failed to fetch");
    const path = url.slice(BASE.length) || "index.html";
    if (!existsSync(new URL(path, DIR))) return new Response("", { status: 404 });
    const r = new Response(readFileSync(new URL(path, DIR)), { status: 200 });
    Object.defineProperty(r, "type", { value: "basic" });
    return r;
  };
  const key = (k) => new URL(typeof k === "string" ? k : k.url, `${BASE}sw.js`).href;
  const cache = {
    async put(k, res) { store.set(key(k), await res.clone().arrayBuffer()); },
    async match(k) { const b = store.get(key(k)); return b ? new Response(b) : undefined; },
    async addAll(list) { for (const u of list) { const r = await fetchImpl(key(u)); if (!r.ok) throw new Error(`addAll ${u}`); await cache.put(u, r); } },
  };
  const self = {
    location: new URL(`${BASE}sw.js`), registration: { scope: BASE },
    addEventListener: (t, fn) => { listeners[t] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} },
  };
  const caches = { open: async () => cache, keys: async () => [], delete: async () => true, match: (k) => cache.match(k) };
  vm.runInNewContext(read("sw.js"), { self, caches, fetch: fetchImpl, URL, Response, console, Promise, Set });
  return { listeners, store, net };
}

function importClosure() {
  const seen = new Set(["index.html"]);
  const queue = ["index.html"];
  while (queue.length) {
    const f = queue.shift();
    for (const m of read(f).matchAll(/(?:from|import)\s*\(?\s*["']\.\/([\w./-]+\.m?js)["']/g)) if (!seen.has(m[1])) { seen.add(m[1]); queue.push(m[1]); }
  }
  return seen;
}

test("installing the worker caches the shell and every module index.html imports, found on its own", async () => {
  const w = loadWorker();
  let done;
  w.listeners.install({ waitUntil: (p) => { done = p; } });
  await done;
  const cached = new Set([...w.store.keys()].map((u) => u.slice(BASE.length)));
  const closure = importClosure();
  assert.ok(closure.size >= 3, "index.html imports engine, usage and tabs at least");
  for (const f of closure) assert.ok(cached.has(f), `${f} not cached for offline use`);
  for (const f of ["", "manifest.webmanifest", "icon-192.png", "icon-512.png"]) assert.ok(cached.has(f), `${f || "./"} not cached`);
  assert.ok([...cached].every((f) => !f.startsWith("api/")));
});

test("the worker never answers /api/*, the inquiry form, the calendar feed, POSTs or other origins", () => {
  const w = loadWorker();
  const handled = (url, method = "GET", mode = "cors") => {
    let hit = false;
    w.listeners.fetch({ request: { url, method, mode }, respondWith: (p) => { hit = true; p.catch(() => {}); } });
    return hit;
  };
  assert.equal(handled(`${BASE}index.html`, "GET", "navigate"), true);
  assert.equal(handled(`${BASE}engine.mjs`), true);
  assert.equal(handled(`${BASE}api/desk`), false);
  assert.equal(handled(`${BASE}api/today`), false);
  assert.equal(handled(`${BASE}api/desk`, "PUT"), false);
  assert.equal(handled(`${BASE}inquiry`, "POST"), false);
  assert.equal(handled(`${BASE}calendar.ics?t=secret`), false);
  assert.equal(handled(`${BASE}healthz`), false);
  assert.equal(handled("https://my-sitter-desk.onrender.com/api/desk"), false);
  assert.equal(handled("https://sitter.example/other-app/index.html"), false);
});

test("offline, a cached page is served from the cache and a navigation falls back to the app", async () => {
  const w = loadWorker();
  let done;
  w.listeners.install({ waitUntil: (p) => { done = p; } });
  await done;
  const answer = async (url, mode) => {
    let p;
    w.listeners.fetch({ request: { url, method: "GET", mode }, respondWith: (x) => { p = x; } });
    return p;
  };
  w.net.online = false;
  const res = await answer(`${BASE}engine.mjs`, "cors");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /export function quote/);
  const nav = await answer(`${BASE}?from=homescreen`, "navigate");
  assert.match(await nav.text(), /<title>Babysitting Business Kit/);
  const miss = await answer(`${BASE}not-cached.mjs`, "cors");
  assert.equal(miss.type, "error");
});

test("the self-hosted server serves the PWA files and guide pages with the right types, and the image copies them", async () => {
  const state = { desk: emptyDesk() };
  const h = handler(state, () => {}, {}, () => Date.parse("2026-10-30T12:00:00Z"), async () => ({ ok: true }));
  const get = (path) => new Promise((resolve) => {
    const res = { writeHead(code, headers) { this.code = code; this.headers = headers; }, end(body) { resolve({ code: this.code, type: this.headers["content-type"], body }); } };
    h({ method: "GET", url: path, headers: {}, socket: {} }, res);
  });
  const want = { "/sw.js": /javascript/, "/manifest.webmanifest": /manifest\+json/, "/icon-192.png": /image\/png/, "/icon.svg": /svg/, "/tabs.mjs": /javascript/, "/how-much-to-charge-for-babysitting.html": /html/, "/babysitting-references.html": /html/, "/how-to-start-a-babysitting-business.html": /html/, "/babysitting-taxes.html": /html/ };
  for (const [p, type] of Object.entries(want)) {
    const r = await get(p);
    assert.equal(r.code, 200, p);
    assert.match(r.type, type, p);
  }
  const copied = read("Dockerfile").match(/^COPY (.+) \.\/$/m)[1].split(/\s+/);
  for (const p of Object.keys(want)) assert.ok(copied.includes(p.slice(1)), `${p} not copied into the image`);
  assert.ok(copied.includes("icon-512.png") && copied.includes("icon-maskable-512.png") && copied.includes("apple-touch-icon.png"));
});
