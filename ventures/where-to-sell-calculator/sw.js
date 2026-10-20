// Offline shell for the installed app. Caches this directory's own files only;
// there are no third-party requests and nothing is sent anywhere.
const CACHE = "where-to-sell-v1";
const SHELL = [
  "./", "./index.html", "./calc.mjs", "./export.mjs", "./handoff.mjs", "./sourcing.mjs", "./share.mjs", "./usage.mjs",
  "./does-it-actually-sell-there.html",
  "./etsy-vs-ebay-fees.html",
  "./returns-change-the-ranking.html",
  "./reverb-vs-ebay-for-gear.html",
  "./vs-crosslist.html",
  "./vs-each-marketplaces-own-calculator.html",
  "./vs-list-perfectly.html",
  "./vs-vendoo.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first so a fixed calculator reaches people at once; cache when offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html"))),
  );
});
