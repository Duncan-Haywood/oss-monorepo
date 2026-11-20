import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import vm from "node:vm";
import { inflateSync } from "node:zlib";
import { iconPng, crc32, manifestJson, startUrl, SW_JS, pwaHeadHtml, pwaBodyHtml, NET_WAIT_MS, MAX_SAVED } from "./pwa.mjs";
import { handler, emptyState } from "./server.mjs";
import { captainKey } from "./confirm.mjs";

function readPng(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let i = 8, ihdr = null; const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString("ascii", i + 4, i + 8), data = buf.subarray(i + 8, i + 8 + len);
    assert.equal(buf.readUInt32BE(i + 8 + len), crc32(buf.subarray(i + 4, i + 8 + len)), `${type} CRC`);
    if (type === "IHDR") ihdr = data; else if (type === "IDAT") idat.push(data);
    i += 12 + len;
  }
  const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4), raw = inflateSync(Buffer.concat(idat));
  assert.equal(raw.length, (w * 3 + 1) * h);
  return { w, h, px: (x, y) => [...raw.subarray(y * (w * 3 + 1) + 1 + x * 3, y * (w * 3 + 1) + 4 + x * 3)] };
}

test("icons are valid PNGs: green margin (safe for a round mask), white calendar page, one filled day", () => {
  assert.equal(crc32(Buffer.from("IEND")), 0xae426082); // the CRC every PNG's IEND chunk carries
  for (const size of [192, 512]) {
    const p = readPng(iconPng(size));
    assert.equal(p.w, size); assert.equal(p.h, size);
    const at = (ux, uy) => p.px(Math.floor(ux * size / 32), Math.floor(uy * size / 32));
    assert.deepEqual(at(1, 1), [0x17, 0x6f, 0x2c]);
    assert.deepEqual(at(16, 23), [255, 255, 255]);
    assert.deepEqual(at(20, 18.3), [0x17, 0x6f, 0x2c]); // middle row, last column
    // everything outside the circle a maskable icon keeps (radius 40% of the size) is plain green
    for (let y = 0; y < size; y += 7) for (let x = 0; x < size; x += 7) {
      if (Math.hypot(x - size / 2, y - size / 2) > 0.4 * size) assert.deepEqual(p.px(x, y), [0x17, 0x6f, 0x2c]);
    }
  }
  assert.throws(() => iconPng(8));
});

test("manifest opens the same player or captain link the phone installed from", () => {
  const m = JSON.parse(manifestJson({ name: "League schedule", token: "a b&c", cap: "K1", team: "Hawks" }));
  assert.equal(m.start_url, "/league?t=a%20b%26c&c=K1");
  assert.equal(m.scope, "/league");
  assert.equal(m.display, "standalone");
  assert.equal(m.short_name, "Hawks");
  assert.ok(m.icons.some((i) => i.sizes === "192x192") && m.icons.some((i) => i.sizes === "512x512"));
  assert.equal(startUrl("tok"), "/league?t=tok");
  assert.match(pwaHeadHtml("t<k", "c"), /href="\/league\/manifest\.webmanifest\?t=t%3Ck&amp;c=c"/);
  const body = pwaBodyHtml(Date.UTC(2026, 10, 20, 18, 5), { team: 2 });
  assert.match(body, /data-offline="0" data-saved="2026-11-20T18:05:00.000Z"/);
  assert.match(body, /var want="2"/);
});

// The worker run against stand-ins for the browser's caches, fetch and events.
function worker({ fetchImpl }) {
  const store = new Map(), listeners = {};
  const cache = {
    put: async (req, res) => { store.delete(req.url); store.set(req.url, await res.text()); },
    match: async (req) => store.has(req.url) ? new Response(store.get(req.url), { status: 200 }) : undefined,
    keys: async () => [...store.keys()].map((url) => ({ url })),
    delete: async (k) => store.delete(k.url),
  };
  const ctx = {
    self: { addEventListener: (n, f) => { listeners[n] = f; }, location: { origin: "https://l.example" }, skipWaiting() {}, clients: { claim: async () => {} } },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: fetchImpl, Response, URL, Promise, setTimeout, clearTimeout,
  };
  vm.runInNewContext(SW_JS, ctx);
  async function go(url, { method = "GET", mode = "navigate" } = {}) {
    let answer = null; const waits = [];
    listeners.fetch({ request: { url, method, mode }, respondWith: (p) => { answer = p; }, waitUntil: (p) => waits.push(p) });
    if (!answer) return null;
    const res = await answer; const at = Date.now(); await Promise.all(waits);
    return { status: res.status, text: await res.text(), at };
  }
  return { go, store };
}
const page = (n) => `<p id="offline" data-offline="0" data-saved="x">saved</p>copy ${n}`;

test("worker: network first, saved copy on a failed network marked offline, nothing else touched", async () => {
  let online = true, n = 0;
  const w = worker({ fetchImpl: async (req) => { if (!online) throw new TypeError("offline"); n++; return new Response(page(n), { status: 200 }); } });
  const url = "https://l.example/league?t=tok";
  assert.match((await w.go(url)).text, /copy 1/);
  assert.match((await w.go(url)).text, /copy 2/);
  online = false;
  const off = await w.go(url);
  assert.equal(off.status, 200);
  assert.match(off.text, /data-offline="1"/);
  assert.match(off.text, /copy 2/);
  const none = await w.go("https://l.example/league?t=other");
  assert.equal(none.status, 503);
  assert.match(none.text, /has not saved this league page yet/);
  assert.equal(await w.go("https://l.example/admin?key=adm"), null);
  assert.equal(await w.go("https://l.example/league/ics?t=tok&team=0", { mode: "no-cors" }), null);
  assert.equal(await w.go(url, { method: "POST" }), null);
  assert.equal(await w.go("https://elsewhere.example/league?t=tok"), null);
});

test("worker: a refused link never replaces a good copy, and at most MAX_SAVED links are kept", async () => {
  let status = 200;
  const w = worker({ fetchImpl: async () => new Response(status === 200 ? page("good") : "link required", { status }) });
  const url = "https://l.example/league?t=tok";
  await w.go(url);
  status = 401;
  assert.equal((await w.go(url)).status, 401);
  assert.match(w.store.get(url), /copy good/);
  status = 200;
  for (let i = 0; i < MAX_SAVED + 3; i++) await w.go(`https://l.example/league?t=tok&c=K${i}`);
  assert.equal(w.store.size, MAX_SAVED);
  assert.ok(w.store.has(`https://l.example/league?t=tok&c=K${MAX_SAVED + 2}`));
});

test("worker: a network slower than the wait shows the saved copy", { timeout: NET_WAIT_MS + 5000 }, async () => {
  let slow = false;
  const w = worker({ fetchImpl: () => slow ? new Promise((r) => setTimeout(() => r(new Response(page("late"), { status: 200 })), NET_WAIT_MS + 800)) : Promise.resolve(new Response(page("fast"), { status: 200 })) });
  const url = "https://l.example/league?t=tok";
  await w.go(url);
  slow = true;
  const t0 = Date.now(), r = await w.go(url);
  assert.ok(r.at - t0 < NET_WAIT_MS + 500, `answered after ${r.at - t0} ms`);
  assert.match(r.text, /copy fast/);
  assert.match(r.text, /data-offline="1"/);
  assert.match(w.store.get(url), /copy late/); // the late answer still refreshed the copy for next time
});

test("server: worker and icons need no link, the manifest needs the league link and follows a captain's", async () => {
  const env = { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" };
  const state = emptyState();
  const srv = http.createServer(handler(state, () => {}, env, () => Date.UTC(2026, 9, 1)));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const sw = await fetch(base + "/sw.js");
    assert.equal(sw.status, 200);
    assert.match(sw.headers.get("content-type"), /javascript/);
    assert.equal(sw.headers.get("service-worker-allowed"), "/");
    assert.doesNotMatch(await sw.text(), /tok|adm/);
    const icon = await fetch(base + "/icon-512.png");
    assert.equal(icon.headers.get("content-type"), "image/png");
    assert.equal(readPng(Buffer.from(await icon.arrayBuffer())).w, 512);
    assert.equal((await fetch(base + "/league/manifest.webmanifest")).status, 401);
    assert.equal(JSON.parse(await (await fetch(base + "/league/manifest.webmanifest?t=tok")).text()).start_url, "/league?t=tok");
    state.published = true;
    const teams = state.fields.teams.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const key = captainKey("adm", teams[1]);
    const m = JSON.parse(await (await fetch(`${base}/league/manifest.webmanifest?t=tok&c=${key}`)).text());
    assert.equal(m.start_url, `/league?t=tok&c=${key}`);
    assert.equal(m.short_name, teams[1].slice(0, 12));
    const html = await (await fetch(`${base}/league?t=tok&c=${key}`)).text();
    assert.match(html, /rel="manifest" href="\/league\/manifest\.webmanifest\?t=tok&amp;c=/);
    assert.match(html, /data-offline="0" data-saved="2026-10-01T00:00:00.000Z"/);
    assert.match(html, /register\("\/sw\.js"/);
    assert.match(html, /var want="1"/);
    assert.match(await (await fetch(`${base}/league?t=tok`)).text(), /var want=null/);
    assert.doesNotMatch(await (await fetch(`${base}/admin?key=adm`)).text(), /sw\.js|manifest/);
  } finally { srv.close(); }
});
