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

import zlib from 'node:zlib';

import { drawText, headlineFrom, layout } from './cardtext.mjs';

export const THEME_COLOR = '#12594a';
const BACKGROUND_COLOR = '#eef2f7';

// ---------------------------------------------------------------------------
// Icons
//
// Written as raw PNG rather than pulled from a design asset: the build has no
// image toolchain, an SVG icon is still not honoured by every installer, and a
// missing icon is the difference between "Install app" appearing and not.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePngRect(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // One filter byte (0 = none) per scanline, ahead of that row's pixels.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const encodePng = (size, rgba) => encodePngRect(size, size, rgba);

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * A calculator mark: a keypad body, a display bar, and two rows of keys.
 *
 * `maskable` renders full-bleed with the mark inside the 80% safe zone, which
 * is what Android crops to a circle; the plain variant keeps a rounded square
 * so it still reads as an icon where no mask is applied.
 */
export function renderIcon({ size = 192, maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const [ar, ag, ab] = hexToRgb(THEME_COLOR);

  const put = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  };

  const inRoundedRect = (x, y, left, top, w, h, radius) => {
    if (x < left || y < top || x >= left + w || y >= top + h) return false;
    const dx = Math.min(x - left, left + w - 1 - x);
    const dy = Math.min(y - top, top + h - 1 - y);
    if (dx >= radius || dy >= radius) return true;
    const cx = radius - dx;
    const cy = radius - dy;
    return cx * cx + cy * cy <= radius * radius;
  };

  const pad = maskable ? size * 0.1 : 0;
  const plate = size - pad * 2;
  const plateRadius = maskable ? plate * 0.5 : size * 0.22;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (inRoundedRect(x, y, pad, pad, plate, plate, plateRadius)) put(x, y, ar, ag, ab);
    }
  }

  // Mark geometry, in fractions of the plate.
  const mx = pad + plate * 0.24;
  const my = pad + plate * 0.2;
  const mw = plate * 0.52;
  const displayH = plate * 0.16;
  const keySize = plate * 0.12;
  const gap = (mw - keySize * 3) / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (inRoundedRect(x, y, mx, my, mw, displayH, plate * 0.03)) {
        put(x, y, 255, 255, 255);
        continue;
      }
      for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const kx = mx + col * (keySize + gap);
          const ky = my + displayH + plate * 0.1 + row * (keySize + plate * 0.06);
          if (inRoundedRect(x, y, kx, ky, keySize, keySize, plate * 0.025)) {
            put(x, y, 255, 255, 255);
          }
        }
      }
    }
  }

  return encodePng(size, rgba);
}

export const ICONS = [
  { file: 'icon-192.png', size: 192, purpose: 'any' },
  { file: 'icon-512.png', size: 512, purpose: 'any' },
  { file: 'icon-maskable-512.png', size: 512, purpose: 'maskable', maskable: true },
];

// 1200x630 is the size every scraper crops to for a wide card, and the ratio
// `summary_large_image` expects. Anything smaller than 600x315 is dropped by
// Facebook and rendered as a small square by X.
export const SOCIAL_CARD_WIDTH = 1200;
export const SOCIAL_CARD_HEIGHT = 630;
// Every scraper crops a wide card differently at the edges — X trims the sides,
// Slack rounds the corners. 72px keeps the lockup, the headline and the footer
// clear of all of it.
const MARGIN = 72;

/**
 * The wide card a link to this site previews as.
 *
 * Deliberately typeless. The PNG encoder above is 40 lines of `zlib` and has no
 * font rasteriser, and pulling one in to draw a headline would add a dependency
 * to a repo whose whole build is dependency-free — for a string the scraper
 * already reads out of `og:title` and renders in its own type beside the image.
 * So this draws the mark and the brand field only, which is the half an image
 * is actually needed for, and lets the words stay words.
 *
 * The mark is `renderIcon`'s calculator, centred. An earlier draft set it
 * left-of-centre to leave room for a headline, and with no headline to fill
 * that room the card read as a picture someone had cropped badly — which is a
 * worse first impression than no image. Centred, it reads as a logo card,
 * which is what it is.
 *
 * `color` swaps the field the mark sits on, so a share into the marketplace-fee
 * forum and a share into a roofing group are visibly different cards.
 *
 * `headline` sets the tool's own name across the card. It is optional, and the
 * two layouts are deliberately different rather than one with an empty slot:
 *
 *   - **With a headline** the mark shrinks to a lockup in the top-left and the
 *     name takes the middle. This is what a tool page and a category page use.
 *   - **Without one** the mark is centred and alone, which is what the hub and
 *     the About page use. An earlier draft kept the mark left-of-centre in both
 *     cases, and with no headline to fill the space the card read as a picture
 *     someone had cropped badly.
 *
 * `cardtext.mjs` is what made the first case possible — a stroke font in a
 * build that still imports nothing but Node builtins. Until it existed, all
 * 164 tools shared one picture, because the encoder here has no rasteriser and
 * a real font would have meant a binary asset and a shaping library.
 */
export function renderSocialCard(options = {}) {
  // Callers before the headline existed passed the field colour positionally.
  const opts = typeof options === 'string' ? { color: options } : (options ?? {});
  const { color = THEME_COLOR, headline = '', kicker = '', footer = '' } = opts;
  const width = SOCIAL_CARD_WIDTH;
  const height = SOCIAL_CARD_HEIGHT;
  const rgba = Buffer.alloc(width * height * 4);
  const [ar, ag, ab] = hexToRgb(color);
  const title = headlineFrom(headline);

  const put = (x, y, r, g, b) => {
    const i = (y * width + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
  };

  const inRoundedRect = (x, y, left, top, w, h, radius) => {
    if (x < left || y < top || x >= left + w || y >= top + h) return false;
    const dx = Math.min(x - left, left + w - 1 - x);
    const dy = Math.min(y - top, top + h - 1 - y);
    if (dx >= radius || dy >= radius) return true;
    const cx = radius - dx;
    const cy = radius - dy;
    return cx * cx + cy * cy <= radius * radius;
  };

  // The mark's plate, on the same geometry `renderIcon` uses. Centred and
  // large when the mark is the whole card; a small top-left lockup when a
  // headline needs the middle.
  const plate = title ? Math.round(height * 0.22) : Math.round(height * 0.62);
  const plateLeft = title ? MARGIN : Math.round((width - plate) / 2);
  const plateTop = title ? MARGIN : Math.round((height - plate) / 2);
  const plateRadius = plate * 0.22;

  const mx = plateLeft + plate * 0.24;
  const my = plateTop + plate * 0.2;
  const mw = plate * 0.52;
  const displayH = plate * 0.16;
  const keySize = plate * 0.12;
  const gap = (mw - keySize * 3) / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      put(x, y, ar, ag, ab);
      if (!inRoundedRect(x, y, plateLeft, plateTop, plate, plate, plateRadius)) continue;
      // The plate is a shade lighter than the field so the mark reads as an
      // object on a background rather than as a hole punched in it.
      put(x, y, Math.min(255, ar + 18), Math.min(255, ag + 24), Math.min(255, ab + 20));
      if (inRoundedRect(x, y, mx, my, mw, displayH, plate * 0.03)) {
        put(x, y, 255, 255, 255);
        continue;
      }
      for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const kx = mx + col * (keySize + gap);
          const ky = my + displayH + plate * 0.1 + row * (keySize + plate * 0.06);
          if (inRoundedRect(x, y, kx, ky, keySize, keySize, plate * 0.025)) put(x, y, 255, 255, 255);
        }
      }
    }
  }

  if (title) {
    const target = { width, height, rgba };
    // Supporting type is white mixed back towards the field so the headline
    // stays the one thing read first. Mixing rather than alpha-blending keeps
    // `drawText` to a single opaque composite per run.
    const muted = [ar, ag, ab].map((c) => Math.round(c + (255 - c) * 0.72));
    const textLeft = MARGIN;
    const textRight = width - MARGIN;

    if (kicker) {
      const size = 26;
      drawText(target, kicker.toUpperCase(), {
        x: plateLeft + plate + 26,
        y: plateTop + plate / 2 + size * 0.5,
        size,
        weight: 0.16,
        rgb: muted,
      });
    }

    // The headline gets everything between the lockup and the footer. Three
    // lines is the practical ceiling: at four, the size that fits is smaller
    // than the footer, and the card stops reading as a headline at all.
    const bandTop = plateTop + plate + 54;
    const bandBottom = height - MARGIN - (footer ? 96 : 0);
    const { lines, size, lineHeight } = layout(title, {
      maxWidth: textRight - textLeft,
      maxHeight: bandBottom - bandTop,
      maxLines: 3,
      maxSize: 96,
    });
    // Optically centre the block in the band rather than hanging it from the
    // top: a one-line title otherwise floats against the lockup with the whole
    // lower half of the card empty under it.
    const blockHeight = size + (lines.length - 1) * lineHeight;
    let baseline = bandTop + (bandBottom - bandTop - blockHeight) / 2 + size;
    for (const line of lines) {
      drawText(target, line, { x: textLeft, y: baseline, size, weight: 0.135 });
      baseline += lineHeight;
    }

    if (footer) {
      const size = 24;
      drawText(target, footer.toUpperCase(), {
        x: textLeft,
        y: height - MARGIN + size * 0.2,
        size,
        weight: 0.16,
        rgb: muted,
      });
    }
  }

  return encodePngRect(width, height, rgba);
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export function renderManifest(baseUrl, toolCount, hasExternalCallException = false) {
  return `${JSON.stringify(
    {
      name: 'Free Small-Business Calculators',
      short_name: 'Calculators',
      description:
        `${toolCount} free calculators for marketplace sellers, trade contractors, and small teams. ` +
        (hasExternalCallException
          ? 'Everything runs in your browser, offline included, except one lookup tool that checks a public API — see the About page for which one.'
          : 'Everything runs in your browser, offline included — nothing you type is uploaded.'),
      start_url: baseUrl,
      scope: baseUrl,
      display: 'standalone',
      orientation: 'any',
      background_color: BACKGROUND_COLOR,
      theme_color: THEME_COLOR,
      icons: ICONS.map(({ file, size, purpose }) => ({
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
 * @param bundle     fetched only when the visitor asks to save everything.
 */
export function renderServiceWorker({ cacheName, shell, bundle }) {
  return `// Generated by platform/pages/build.mjs — do not edit in dist/.
//
// Cache-first, with the cache name carrying this build's content hash. That is
// what makes cache-first safe here: a new deploy cannot be served from an old
// cache, because it never looks in one — `+ '`activate`' + ` deletes them.
const CACHE = ${JSON.stringify(cacheName)};
const SHELL = ${JSON.stringify(shell, null, 2)};
const BUNDLE = ${JSON.stringify(bundle, null, 2)};
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

// "Save all tools for offline" on the hub. Sequential on purpose: this runs on
// a phone about to lose signal, and 200 parallel requests is how you get rate
// limited or hang the radio. Progress is reported back per file so the button
// can show real movement rather than a spinner.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'cache-all') return;

  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const reply = (message) => {
      if (event.source) event.source.postMessage(message);
    };

    let done = 0;
    let failed = 0;
    for (const asset of BUNDLE) {
      try {
        const response = await fetch(asset, { cache: 'no-cache' });
        if (response.ok) await cache.put(asset, response.clone());
        else failed += 1;
      } catch {
        failed += 1;
      }
      done += 1;
      reply({ type: 'cache-all-progress', done, total: BUNDLE.length, failed });
    }
    reply({ type: 'cache-all-complete', total: BUNDLE.length, failed });
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
  <link rel="apple-touch-icon" href="${rootRel}icon-192.png">
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

const MARKER = 'rel="manifest"';

/** Insert the offline wiring into a page's head, idempotently. */
export function injectOfflineSupport(html, rootRel) {
  if (html.includes(MARKER)) return { html, injected: false };
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
// `addOfflineSupport`'s post-write patch of this marker in build.mjs) so it
// cannot drift from reality again.
export const OFFLINE_SIZE_MARKER = '{{OFFLINE_BUNDLE_SIZE}}';

export const OFFLINE_WIDGET_HTML = `    <div class="support offline" id="offline-box" hidden>
      <strong>Going somewhere without signal?</strong>
      <p id="offline-copy">
        Save every tool to this device — about ${OFFLINE_SIZE_MARKER} — and they
        all keep working with no connection. Nothing is uploaded either way.
      </p>
      <button type="button" id="offline-save">Save all tools for offline</button>
      <p id="offline-status" role="status" aria-live="polite"></p>
    </div>`;

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
    const save = document.getElementById('offline-save');
    const status = document.getElementById('offline-status');

    if ('serviceWorker' in navigator && box) {
      box.hidden = false;
      // Whether a hub visitor takes the offline offer is the question this
      // feature exists to answer, so it goes through the same local,
      // opt-out-respecting counter as every other hub event.
      record('offline_offer_shown');

      navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.type === 'cache-all-progress') {
          status.textContent = 'Saving ' + data.done + ' of ' + data.total + '…';
        } else if (data.type === 'cache-all-complete') {
          save.disabled = false;
          save.textContent = 'Save again';
          status.textContent = data.failed
            ? 'Saved, except ' + data.failed + ' file(s). Try again on a better connection.'
            : 'Saved. Every tool now opens with no connection.';
          record(data.failed ? 'offline_saved_partial' : 'offline_saved');
          try { localStorage.setItem('portfolio-offline-saved', '1'); } catch { /* ignore */ }
        }
      });

      save.addEventListener('click', async () => {
        save.disabled = true;
        status.textContent = 'Starting…';
        try {
          const registration = await navigator.serviceWorker.ready;
          const worker = navigator.serviceWorker.controller || registration.active;
          if (!worker) throw new Error('no worker');
          worker.postMessage({ type: 'cache-all' });
        } catch {
          save.disabled = false;
          status.textContent = 'Could not start. Reload the page and try again.';
        }
      });

      try {
        if (localStorage.getItem('portfolio-offline-saved') === '1') {
          save.textContent = 'Save again';
          status.textContent = 'Saved on this device.';
        }
      } catch { /* ignore */ }
    }
`;
