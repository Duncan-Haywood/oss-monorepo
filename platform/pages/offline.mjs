// Makes the published site work without a network, and installable to a home
// screen.
//
// Why this exists
// ---------------
// The audience for these tools is frequently somewhere with no signal at the
// moment they need the number: a contractor measuring in a crawl space or a
// basement, a seller in a warehouse aisle, a driver at a dock. Every tool here
// is already pure client-side arithmetic — nothing it computes needs a server —
// so the only thing standing between that user and an answer is fetching the
// page itself.
//
// A service worker closes exactly that gap, and it is the whole reason the
// single-site build was worth doing: one worker at the origin root covers all
// of the tools at once. Two behaviours:
//
//   1. Anything you have opened before opens again offline, automatically.
//   2. "Save all tools for offline" on the hub fetches every tool's entry page
//      and modules up front — for the person who knows they are about to lose
//      signal, and would rather spend the data now than find out later. The
//      hub's own copy states the real size, computed at build time (see
//      OFFLINE_SIZE_MARKER below) rather than a number typed once and left to
//      go stale as the catalog grows.
//
// Staleness is bounded by construction: the cache name carries a hash of the
// built site, so a deploy lands in a *new* cache and `activate` deletes every
// older one. A visitor can therefore be at most one navigation behind, and
// never mixes files from two builds.

import { renderCard, renderMarkIcon } from './sharecard.mjs';

export const THEME_COLOR = '#12594a';
const BACKGROUND_COLOR = '#eef2f7';

// ---------------------------------------------------------------------------
// Icons
//
// Written as raw PNG rather than pulled from a design asset: the build has no
// image toolchain, an SVG icon is still not honoured by every installer, and a
// missing icon is the difference between "Install app" appearing and not.
// ---------------------------------------------------------------------------

/**
 * The app icon: the brand mark (three rising bars on the header's
 * teal-to-indigo square), drawn by `sharecard.mjs` so the tab, the home-screen
 * tile and every share card carry one logo. It used to be a calculator, from
 * when the site was only calculators; it now also holds research and apps.
 *
 * `maskable` renders full-bleed with the mark inside the 80% safe zone, which
 * is what Android crops to a circle; the plain variant keeps a rounded square
 * so it still reads as an icon where no mask is applied. `opaque` is a
 * full-bleed square with no alpha, which is what Apple's touch icon needs
 * (iOS paints a transparent corner black and rounds the corners itself).
 */
export function renderIcon({ size = 192, maskable = false, opaque = false } = {}) {
  return renderMarkIcon({ size, maskable, opaque });
}

export const ICONS = [
  { file: 'icon-192.png', size: 192, purpose: 'any' },
  { file: 'icon-512.png', size: 512, purpose: 'any' },
  { file: 'icon-maskable-512.png', size: 512, purpose: 'maskable', maskable: true },
  // Not in the manifest: iOS reads `<link rel="apple-touch-icon">` instead.
  { file: 'apple-touch-icon.png', size: 180, opaque: true, manifest: false },
];

// 1200x630 is the size every scraper crops to for a wide card, and the ratio
// `summary_large_image` expects. Anything smaller than 600x315 is dropped by
// Facebook and rendered as a small square by X.
export const SOCIAL_CARD_WIDTH = 1200;
export const SOCIAL_CARD_HEIGHT = 630;

/**
 * The wide card a link to this site previews as. See `sharecard.mjs` for the
 * drawing: the homepage hero's night field and aurora, the brand lockup, the
 * page's section as a coloured kicker and its name set in Inter.
 *
 * `color` is the section's accent (the corner glow, the kicker and the rule),
 * so a share into the marketplace-fee forum and a share into a roofing group
 * are visibly different cards. `headline` is the page's name; without one the
 * card is the brand lockup alone. `kicker`, `subtitle`, `footer`, `address`
 * and `highlight` pass straight through to `renderCard`.
 */
export function renderSocialCard(options = {}) {
  // Callers before the headline existed passed the field colour positionally.
  const opts = typeof options === 'string' ? { color: options } : (options ?? {});
  const { color = THEME_COLOR, ...rest } = opts;
  return renderCard({ accent: color, ...rest });
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export function renderManifest(baseUrl, toolCount, hasExternalCallException = false) {
  return `${JSON.stringify(
    {
      name: 'Maris Stella Labs',
      // What a home screen prints under the icon: twelve characters at most.
      short_name: 'Open Tools',
      description:
        `${toolCount} free tools for marketplace sellers, trade contractors and small teams, plus open research. ` +
        (hasExternalCallException
          ? 'Everything runs in your browser, offline included, except one lookup tool that checks a public API — see the About page for which one.'
          : 'Everything runs in your browser, offline included — nothing you type is uploaded.'),
      start_url: baseUrl,
      scope: baseUrl,
      display: 'standalone',
      orientation: 'any',
      background_color: BACKGROUND_COLOR,
      theme_color: THEME_COLOR,
      icons: ICONS.filter((icon) => icon.manifest !== false).map(({ file, size, purpose }) => ({
        src: `${baseUrl}${file}`,
        sizes: `${size}x${size}`,
        type: 'image/png',
        purpose,
      })),
    },
    null,
    2,
  )}\n`;
}

// ---------------------------------------------------------------------------
// Offline fallback page
// ---------------------------------------------------------------------------

export function renderOfflinePage(baseUrl) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Offline</title>
  <!-- A fallback shell, not a destination. Indexed, it would put "You're
       offline" in a search result for a calculator. -->
  <meta name="robots" content="noindex">
  <meta name="theme-color" content="${THEME_COLOR}">
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 12vh auto;
           padding: 0 1.2rem; line-height: 1.6; color: #1d2530; background: #eef2f7; }
    a { color: #12594a; }
    ul { padding-left: 1.1rem; }
    @media (prefers-color-scheme: dark) {
      body { color: #e8eef5; background: #10151c; } a { color: #7fd8c0; }
    }
  </style>
</head>
<body>
  <h1>You're offline, and this page isn't saved yet</h1>
  <p>
    Every tool here runs entirely on your device, so one you have already opened
    still works with no signal. This particular page hasn't been opened on this
    device yet, so there is nothing saved to show.
  </p>
  <ul>
    <li><a href="${baseUrl}">Open the list of tools</a> — it works offline once visited.</li>
    <li>Back on a connection, use <strong>Save all tools for offline</strong> on that page
        to keep every calculator available without signal.</li>
  </ul>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Service worker
// ---------------------------------------------------------------------------

/**
 * @param cacheName  carries a hash of the built site, so each deploy gets its
 *                   own cache and `activate` can drop every older one.
 * @param shell      precached on install: what a first offline visit needs.
 * @param shared     the modules and styles every tool page loads, fetched
 *                    alongside whichever category the visitor picks below.
 * @param bundles    category id -> that category's own tool pages and
 *                    scripts. Split by category, rather than one bundle of
 *                    every tool, because the whole-catalog bundle does not
 *                    scale: it grows with every venture the fleet ships and
 *                    already once forced this file's own byte ceiling to be
 *                    raised twice (see build.test.mjs's "stays small enough
 *                    to fetch on mobile data"). A category is bounded by how
 *                    many tools share a niche, not by the catalog's total
 *                    size.
 */
export function renderServiceWorker({ cacheName, shell, shared, bundles }) {
  return `// Generated by platform/pages/build.mjs — do not edit in dist/.
//
// Cache-first, with the cache name carrying this build's content hash. That is
// what makes cache-first safe here: a new deploy cannot be served from an old
// cache, because it never looks in one — `+ '`activate`' + ` deletes them.
const CACHE = ${JSON.stringify(cacheName)};
const SHELL = ${JSON.stringify(shell, null, 2)};
const SHARED = ${JSON.stringify(shared, null, 2)};
const BUNDLES = ${JSON.stringify(bundles, null, 2)};
const OFFLINE_PAGE = 'offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // A single missing shell entry must not leave the site with no worker at
      // all; the runtime path below still caches whatever the visitor opens.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never hand back a cached copy of the worker itself, or of the manifest that
  // points at it; the browser's own update check has to see the real file.
  if (url.pathname.endsWith('/sw.js')) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') {
            return caches.match(OFFLINE_PAGE).then((page) => page || Response.error());
          }
          return Response.error();
        });
    }),
  );
});

// "Save this category for offline" on the hub. Sequential on purpose: this
// runs on a phone about to lose signal, and dozens of parallel requests is
// how you get rate limited or hang the radio. Progress is reported back per
// file so the button can show real movement rather than a spinner.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'cache-all') return;
  const perCategory = BUNDLES[event.data.category];
  // An unrecognised category (a stale page from a previous deploy, or a
  // tampered message) has nothing to fetch rather than falling back to
  // every category at once.
  if (!perCategory) return;
  const assets = [...SHARED, ...perCategory];

  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const reply = (message) => {
      if (event.source) event.source.postMessage(message);
    };

    let done = 0;
    let failed = 0;
    for (const asset of assets) {
      try {
        const response = await fetch(asset, { cache: 'no-cache' });
        if (response.ok) await cache.put(asset, response.clone());
        else failed += 1;
      } catch {
        failed += 1;
      }
      done += 1;
      reply({ type: 'cache-all-progress', done, total: assets.length, failed });
    }
    reply({ type: 'cache-all-complete', total: assets.length, failed });
  })());
});
`;
}

/**
 * The rollback path. A service worker outlives the deploy that installed it: it
 * lives on the visitor's device and keeps answering there, so "revert the
 * commit" is not by itself a way to take one back. Building with
 * `PAGES_DISABLE_SW=1` publishes a worker whose only job is to delete every
 * cache and unregister itself, which reaches each visitor on their next visit.
 */
export function renderKillSwitchWorker() {
  return `// Generated with PAGES_DISABLE_SW=1 — this worker removes itself.
//
// Deployed in place of the caching worker, this is how the offline layer is
// withdrawn from devices that already have it: a browser checks for a new
// sw.js on navigation, installs this one, and this one deletes the caches and
// unregisters, leaving the site as plain pages again.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
`;
}

// ---------------------------------------------------------------------------
// Page wiring
// ---------------------------------------------------------------------------

/**
 * The `<head>` additions every published page needs: the manifest, the theme
 * colour, and the registration itself. Injected into venture pages by the build
 * rather than committed into each venture's source — the same reason link
 * repair lives here. A venture's page is written to be openable on its own, and
 * stays that way.
 *
 * `rootRel` is the relative path from the page to the site root ('' at the
 * root, '../' one level down), so the site works under a project Pages path
 * without any page needing to know what that path is.
 */
export function offlineHead(rootRel) {
  return `  <link rel="manifest" href="${rootRel}manifest.webmanifest">
  <meta name="theme-color" content="${THEME_COLOR}">
  <link rel="apple-touch-icon" href="${rootRel}apple-touch-icon.png">
  <!-- The build also emits /favicon.ico, which is what a browser fetches with
       no markup to go on; a linked PNG is preferred where both exist and is
       the one that stays sharp on a high-DPI tab strip. -->
  <link rel="icon" type="image/png" href="${rootRel}icon-192.png">
  <script>
    // Progressive enhancement only: with no service worker support, or with the
    // registration rejected (private mode, an unsupported browser), every page
    // behaves exactly as it did before.
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('${rootRel}sw.js').catch(() => {});
      });
    }
  </script>`;
}

/**
 * A real `<link>` element whose `rel` carries the `manifest` token.
 *
 * `rel` is a space-separated token list, so `rel="manifest alternate"` counts
 * and `rel="manifest-notes"` does not; the value may be double-quoted,
 * single-quoted, or bare.
 */
const MANIFEST_LINK = /<link\b[^>]*\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))[^>]*>/gi;

/** Head content with comments, scripts and styles removed. */
function scannableHead(html) {
  const end = html.indexOf('</head>');
  return (end === -1 ? html : html.slice(0, end))
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

/**
 * Does this page already link a Web App Manifest?
 *
 * Exported for the test, and deliberately not a substring search. Until
 * 2026-09-10 this was `html.includes('rel="manifest"')` against the whole
 * file, which conflated "this page links a manifest" with "this page mentions
 * the attribute". Any page *about* manifests — which is exactly what the PWA
 * and AI-crawler ventures publish — that spelled the attribute unescaped in
 * prose, a code sample, or even an HTML comment warning about this very trap
 * was read as already-wired, so the build skipped its service worker. It was
 * caught by build.test.mjs rather than shipped, but the fix that test demanded
 * was to contort the copy, which is the wrong thing for a guard to ask of an
 * author writing correctly about the subject.
 *
 * Scanning only the head, and only outside comments/scripts/styles, also
 * settles the JSON-LD case by construction: an escaped `rel=\"manifest\"`
 * inside a `<script type="application/ld+json">` block is documentation about
 * a manifest link, never a manifest link.
 */
export function linksManifest(html) {
  const head = scannableHead(html);
  for (const match of head.matchAll(MANIFEST_LINK)) {
    const rel = match[1] ?? match[2] ?? match[3] ?? '';
    if (rel.trim().split(/\s+/).some((token) => token.toLowerCase() === 'manifest')) return true;
  }
  return false;
}

/** Insert the offline wiring into a page's head, idempotently. */
export function injectOfflineSupport(html, rootRel) {
  if (linksManifest(html)) return { html, injected: false };
  const index = html.indexOf('</head>');
  if (index === -1) return { html, injected: false };
  return {
    html: `${html.slice(0, index)}${offlineHead(rootRel)}\n${html.slice(index)}`,
    injected: true,
  };
}

// ---------------------------------------------------------------------------
// Hub widget
// ---------------------------------------------------------------------------

// Written once when the catalog was ~30 tools and never updated as it grew
// past 170 — the button said "about 3 MB" while the real fetch had reached
// 16.8 MB, nearly 6x what someone on limited mobile data was told to expect.
// The size is computed at build time from the actual bundle (see
// `addOfflineSupport`'s post-write patch of these markers in build.mjs) so it
// cannot drift from reality again.
//
// Changed 2026-09-23: one whole-catalog size became one per category, because
// the whole-catalog number was the thing drifting. "Save every tool" grows
// with every venture the fleet ships — it had already forced this feature's
// own byte ceiling to be raised once (8 MB to 16 MB, then switched to a
// gzipped 8 MB proxy) and hit that second ceiling too once the catalog passed
// ~340 tools (see build.test.mjs's "stays small enough to fetch on mobile
// data"). Bumping the number a third time would repeat the mistake; a
// category is bounded by how many tools share a niche, not by the catalog's
// total size, so it can carry a fixed budget honestly.
export function offlineSizeMarker(categoryId) {
  return `{{OFFLINE_BUNDLE_SIZE:${categoryId}}}`;
}

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** @param categories `{ id, title }` for every category on the hub, in the
 *  order they should list in the picker. */
export function renderOfflineWidgetHtml(categories) {
  const options = categories
    .map(
      ({ id, title }) =>
        `        <option value="${escapeHtml(id)}">${escapeHtml(title)} — about ${offlineSizeMarker(id)}</option>`,
    )
    .join('\n');
  return `    <div class="support offline" id="offline-box" hidden>
      <strong>Going somewhere without signal?</strong>
      <p id="offline-copy">
        Save one category of tools to this device and they all keep working
        with no connection. Nothing is uploaded either way.
      </p>
      <select id="offline-category" aria-label="Category to save for offline">
${options}
      </select>
      <button type="button" id="offline-save">Save this category for offline</button>
      <p id="offline-status" role="status" aria-live="polite"></p>
    </div>`;
}

/** "16.8 MB" style label for a byte count, rounded so the copy reads like a
 *  person wrote it rather than a computed value with false precision. */
export function offlineBundleSizeLabel(bytes) {
  const mb = bytes / (1024 * 1024);
  const rounded = mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb);
  return `${rounded} MB`;
}

export const OFFLINE_WIDGET_SCRIPT = `
    // Offline saving is offered only where it can actually work, so the button
    // never appears and then fails.
    const box = document.getElementById('offline-box');
    const category = document.getElementById('offline-category');
    const save = document.getElementById('offline-save');
    const status = document.getElementById('offline-status');

    function savedCategories() {
      try {
        return JSON.parse(localStorage.getItem('portfolio-offline-saved') || '[]');
      } catch { return []; }
    }

    // Re-run on load and on every selection change, so switching categories
    // in the picker doesn't leave a stale "Save again" from whichever one was
    // saved last.
    function refreshForSelection() {
      if (savedCategories().includes(category.value)) {
        save.textContent = 'Save again';
        status.textContent = 'Saved on this device.';
      } else {
        save.textContent = 'Save this category for offline';
        status.textContent = '';
      }
    }

    if ('serviceWorker' in navigator && box && category) {
      box.hidden = false;
      // Whether a hub visitor takes the offline offer is the question this
      // feature exists to answer, so it goes through the same local,
      // opt-out-respecting counter as every other hub event.
      record('offline_offer_shown');
      refreshForSelection();
      category.addEventListener('change', refreshForSelection);

      navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.type === 'cache-all-progress') {
          status.textContent = 'Saving ' + data.done + ' of ' + data.total + '…';
        } else if (data.type === 'cache-all-complete') {
          save.disabled = false;
          save.textContent = 'Save again';
          status.textContent = data.failed
            ? 'Saved, except ' + data.failed + ' file(s). Try again on a better connection.'
            : 'Saved. This category now opens with no connection.';
          record(data.failed ? 'offline_saved_partial' : 'offline_saved');
          try {
            const saved = savedCategories();
            if (!saved.includes(category.value)) saved.push(category.value);
            localStorage.setItem('portfolio-offline-saved', JSON.stringify(saved));
          } catch { /* ignore */ }
        }
      });

      save.addEventListener('click', async () => {
        save.disabled = true;
        status.textContent = 'Starting…';
        try {
          const registration = await navigator.serviceWorker.ready;
          const worker = navigator.serviceWorker.controller || registration.active;
          if (!worker) throw new Error('no worker');
          worker.postMessage({ type: 'cache-all', category: category.value });
        } catch {
          save.disabled = false;
          status.textContent = 'Could not start. Reload the page and try again.';
        }
      });
    }
`;
