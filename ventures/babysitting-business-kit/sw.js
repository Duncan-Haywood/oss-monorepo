// Offline shell for the installed app (Add to Home Screen). Caches this
// directory's own files only. It never touches /api/*, the website inquiry form,
// the calendar feed or anything on another origin, so the self-hosted server's
// desk, keys and leads are always fetched live and never stored here.
//
// The shell is the files below plus every module index.html imports, found at
// install time by following each module import in index.html, so a new module needs
// no edit here. sw.test.mjs runs this file against the real directory.
const CACHE = "babysitting-business-kit-v1";
const SHELL = [
  "./", "./index.html", "./engine.mjs", "./usage.mjs", "./manifest.webmanifest",
  "./icon.svg", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png",
];
const NEVER = /\/(?:api\/|inquiry$|calendar\.ics$|healthz$)/;
const IMPORTS = /(?:from|import)\s*\(?\s*["'](\.\.?\/[\w./-]+\.m?js)["']/g;

function moduleImports(text) {
  return [...String(text).matchAll(IMPORTS)].map((m) => m[1]);
}

async function cacheImportClosure(cache) {
  const queue = [new URL("./index.html", self.location.href).href];
  const seen = new Set(queue);
  while (queue.length && seen.size < 200) {
    const url = queue.shift();
    let res = await cache.match(url);
    if (!res) {
      try { res = await fetch(url); } catch { continue; }
      if (!res.ok) continue;
      await cache.put(url, res.clone());
    }
    for (const spec of moduleImports(await res.text())) {
      const next = new URL(spec, url).href;
      if (!seen.has(next) && next.startsWith(self.registration.scope)) { seen.add(next); queue.push(next); }
    }
  }
  return seen;
}

function cacheable(req) {
  if (req.method !== "GET") return false;
  const url = new URL(req.url);
  return url.origin === self.location.origin && req.url.startsWith(self.registration.scope) && !NEVER.test(url.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL).then(() => cacheImportClosure(c)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("babysitting-business-kit-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first so a fix reaches people at once; the cache answers when offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (!cacheable(req)) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : Response.error()))),
  );
});
