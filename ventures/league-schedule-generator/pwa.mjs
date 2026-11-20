// The player page on a phone's home screen, readable with no signal (2026-11-20).
// Players look up their next game at the field, where reception is often weak. The league page links a
// web app manifest and registers a small service worker. The worker answers only GET /league: it asks
// the network first and, when the network fails or takes longer than NET_WAIT_MS, shows the last copy
// this phone saved, marked "offline, saved at ...". Admin pages, forms and calendar feeds are never
// cached. Icons are PNGs drawn here with node:zlib, so the server keeps zero dependencies.
import { deflateSync } from "node:zlib";

export const NET_WAIT_MS = 4000;
export const CACHE_NAME = "league-page-v1";
export const MAX_SAVED = 6;
export const THEME = "#176f2c";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/**
 * The app icon: a white calendar page with a 3x3 grid of days on the league green, one day filled.
 * Drawn on a square of `size` pixels with a safe margin, so a launcher that crops it to a circle
 * ("maskable") keeps the whole calendar. Returns PNG bytes (8-bit RGB).
 */
export function iconPng(size) {
  if (!Number.isInteger(size) || size < 16 || size > 1024) throw new Error("icon size must be a whole number from 16 to 1024");
  const green = [0x17, 0x6f, 0x2c], white = [255, 255, 255], light = [0xd9, 0xec, 0xdd];
  const u = size / 32; // drawn on a 32-unit grid
  const inBox = (x, y, x0, y0, x1, y1) => x >= x0 * u && x < x1 * u && y >= y0 * u && y < y1 * u;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let c = green;
      if (inBox(x, y, 8, 9, 24, 24)) {
        c = white;
        if (inBox(x, y, 8, 9, 24, 12.5)) c = light; // the page's header band
        for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) {
          const x0 = 10 + k * 4.5, y0 = 14 + r * 3.2;
          if (inBox(x, y, x0, y0, x0 + 3, y0 + 2.2)) c = r === 1 && k === 2 ? green : light;
        }
      }
      if (inBox(x, y, 11.5, 7, 13, 11) || inBox(x, y, 19, 7, 20.5, 11)) c = white; // binder rings
      raw.set(c, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** The player link a home-screen icon opens: the league token, plus the captain key on a captain's page. */
export function startUrl(token, cap = null) {
  return `/league?t=${encodeURIComponent(token)}${cap ? `&c=${encodeURIComponent(cap)}` : ""}`;
}

/** The web app manifest for one player link. `name` is the league's name as the organiser typed it. */
export function manifestJson({ name = "League", token, cap = null, team = null } = {}) {
  const full = team ? `${name}: ${team}` : name;
  return JSON.stringify({
    name: full.slice(0, 60),
    short_name: (team || name).slice(0, 12),
    description: "Fixtures, standings and your team's games. Opens with no signal from the last copy this phone saved.",
    start_url: startUrl(token, cap),
    scope: "/league",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: THEME,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  });
}

/**
 * The service worker, served at /sw.js (no secret in it). Only GET navigations to /league are touched:
 * network first; a copy is saved per link (the token, and the captain key for a captain); on a failed
 * or slow network the saved copy is shown with data-offline="1" so the page says how old it is.
 * Only 200 responses are saved, so a "link required" page never replaces a good copy. At most
 * MAX_SAVED links are kept (a phone that opened several leagues or captain pages).
 */
export const SW_JS = `"use strict";
var CACHE = ${JSON.stringify(CACHE_NAME)}, WAIT = ${NET_WAIT_MS}, MAX = ${MAX_SAVED};
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf("league-page-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
function keep(req, res) {
  return caches.open(CACHE).then(function (c) {
    return c.put(req, res).then(function () { return c.keys(); }).then(function (ks) {
      return Promise.all(ks.slice(0, Math.max(0, ks.length - MAX)).map(function (k) { return c.delete(k); }));
    });
  });
}
function saved(req) {
  return caches.open(CACHE).then(function (c) { return c.match(req); }).then(function (r) {
    if (!r) return null;
    return r.text().then(function (t) {
      return new Response(t.replace('data-offline="0"', 'data-offline="1"'), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    });
  });
}
function noCopy() {
  return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title></head><body style="font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:0 auto;padding:1rem"><h1>No signal</h1><p>This phone has not saved this league page yet. Open it once with a connection and it will be here next time.</p></body></html>', { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
}
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname !== "/league") return;
  // The copy is cloned before the page reads the body, and the worker is kept alive until it is saved,
  // even when the saved copy answered first because the network was slow.
  var saving = null;
  var net = fetch(req).then(function (res) {
    if (res.status === 200) saving = keep(req, res.clone());
    return res;
  });
  e.waitUntil(net.then(function () { return saving; }).catch(function () {}));
  e.respondWith(new Promise(function (resolve) {
    var done = false;
    function fallback() {
      if (done) return;
      saved(req).then(function (r) { if (done) return; if (r) { done = true; resolve(r); } });
    }
    var timer = setTimeout(fallback, WAIT);
    net.then(function (res) { clearTimeout(timer); if (!done) { done = true; resolve(res); } }, function () {
      clearTimeout(timer);
      saved(req).then(function (r) { if (!done) { done = true; resolve(r || noCopy()); } });
    });
  }));
});
`;

/** Head tags for the league page: the manifest for this link, the theme colour and the touch icon. */
export function pwaHeadHtml(token, cap = null) {
  return `<link rel="manifest" href="/league/manifest.webmanifest?${esc(`t=${encodeURIComponent(token)}${cap ? `&c=${encodeURIComponent(cap)}` : ""}`)}"><meta name="theme-color" content="${THEME}"><link rel="apple-touch-icon" href="/icon-192.png"><meta name="apple-mobile-web-app-capable" content="yes">`;
}

/**
 * The bit of the league page that makes it work offline: the "saved at" stamp the worker flips to
 * offline, the worker registration, an install hint, and the "Show only" team remembered on this
 * phone (a captain's page starts on the captain's team; restored once the page's own filter script has
 * run, since this sits above the filter). `savedAt` is the time the server built the page.
 */
export function pwaBodyHtml(savedAt, { team = null } = {}) {
  const iso = new Date(savedAt).toISOString();
  return `<p id="offline" data-offline="0" data-saved="${iso}" hidden style="background:#fff4d6;border:1px solid #e0b84a;padding:.5rem .75rem;border-radius:.4rem">No signal: this is the copy this phone saved <span id="offline-at">${iso.slice(0, 16).replace("T", " ")} UTC</span>. Scores and moves since then are not shown.</p>
<p class="note" id="install-hint">On a phone: add this page to your home screen (Share, then Add to Home Screen; or the browser menu, Install app) and it opens with no signal from the last copy saved.</p>
<script>(function(){var o=document.getElementById("offline");if(o&&o.getAttribute("data-offline")==="1"){o.hidden=false;try{document.getElementById("offline-at").textContent=new Date(o.getAttribute("data-saved")).toLocaleString()}catch(e){}}
if(window.matchMedia&&matchMedia("(display-mode: standalone)").matches){var h=document.getElementById("install-hint");if(h)h.hidden=true}
if("serviceWorker" in navigator&&location.protocol!=="file:"){navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(function(){})}
document.addEventListener("DOMContentLoaded",function(){var f=document.getElementById("f");if(!f)return;var K="league-show-only:"+location.pathname;var want=${team === null ? "null" : JSON.stringify(String(team))};
try{var v=localStorage.getItem(K);if(v!==null)want=v}catch(e){}
if(want!==null&&f.querySelector('option[value="'+want.replace(/[^0-9]/g,"")+'"]')){f.value=want;f.dispatchEvent(new Event("change"))}
f.addEventListener("change",function(){try{localStorage.setItem(K,f.value)}catch(e){}})})})();</script>`;
}
