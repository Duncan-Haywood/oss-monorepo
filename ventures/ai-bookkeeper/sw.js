// Offline shell for the installed app. Caches this directory's own files only;
// there are no third-party requests and nothing is sent anywhere. The list is the
// import closure of index.html; page.test.mjs fails if it falls out of date.
const CACHE = "ai-bookkeeper-v9";
const SHELL = [
  "./", "./accruals.mjs", "./ai.mjs", "./assets.mjs", "./bai2.mjs",
  "./bank.mjs", "./billpay.mjs", "./budget.mjs", "./byok.mjs", "./categorize.mjs",
  "./cfonb.mjs", "./cleanocr.mjs", "./photoocr.mjs", "./collections.mjs", "./deductions.mjs", "./engine.mjs",
  "./annualized.mjs", "./estimatedtax.mjs", "./example-data.mjs", "./fx.mjs", "./index.html", "./inventory.mjs",
  "./invoice.mjs", "./ledger.mjs", "./livefile.mjs", "./loans.mjs", "./n43.mjs", "./opening.mjs",
  "./payouts.mjs", "./plaid.mjs", "./payroll.mjs", "./pdftext.mjs", "./prepaid.mjs", "./receipts.mjs",
  "./cashbasis.mjs", "./compare.mjs", "./reconcile.mjs", "./recurring.mjs", "./salestaxreturn.mjs", "./scorp.mjs", "./sepa.mjs", "./statement.mjs",
  "./statementtext.mjs", "./taxdepr.mjs", "./taxforms.mjs", "./textcodec.mjs", "./usage.mjs",
  "./xls.mjs", "./xlsx.mjs", "./xmlent.mjs", "./yearend.mjs", "./manifest.webmanifest",
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

// Network first so a fix reaches people at once; the cache answers when offline.
// Only same-origin GETs: a bring-your-own-key AI call goes straight to its provider, untouched.
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
