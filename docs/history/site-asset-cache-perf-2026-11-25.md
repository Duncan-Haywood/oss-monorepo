# Site asset cache headers, 2026-11-25 (perf track)

Task `site-perf-asset-cache-headers` (`portfolio/work/tasks.yaml`), opened by
`docs/reports/2026-11-07-live-site-measurements.md`.

## Reading before the change

Measured on the live site, `curl -I` and Playwright (Chromium, one browser
context, so the second visit is a warm one; navigating away and back, not a
reload, which would force revalidation):

- Every file still answers `cache-control: public, max-age=0,
  must-revalidate`, Workers' default: pages, `pf-*.css`/`pf-*.js`, modules,
  and images such as `/showcase/ai-bookkeeper-hero.webp`.
- Cold transfer: `/` 66.9 KB (document 55.7 KB brotli, 213 KB raw),
  `/pay-app-guides/` 41.6 KB, `/pay-application-generator/` 61.5 KB.
  DOMContentLoaded 0.65 to 1.2 s from the container.
- **Warm visits to tool pages never reach the network:** every file of
  `/pay-app-guides/`, `/pay-application-generator/` and
  `/wall-framing-takeoff/` (26 files) came back `fromServiceWorker`. The
  offline layer, not HTTP caching, decides warm tool-page speed. The hub and
  `/writing/` are not in the worker's cache for these files: `/pf-site.css`
  revalidated with a 304 on the warm hub visit.
- The three bet front doors (pay-app pages) load no images or fonts beyond
  the favicon and touch icons.

## Change

`platform/pages/cloudflare/split.mjs` now appends one `_headers` rule per
image, font and media extension (both cases, since `_headers` paths match
case-sensitively: 30 rules, under Cloudflare's 100) to both Workers'
`_headers`:

```
/*.webp
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800
```

HTML, CSS, scripts, modules, JSON and manifests are left out on purpose:
new HTML importing an old cached module can break a page. They wait for
content-hashed URLs (`site-perf-hashed-modules`). The catch-all `/*` rule
sets no `Cache-Control`, because Cloudflare joins the values of two matching
rules that set one header; a test pins that.

## Verification

- `node --test platform/pages/cloudflare/split.test.mjs`: 9 pass, one new
  (image/font/media types get the rule, page/CSS/script types do not, the
  catch-all sets no `Cache-Control`, at most 100 rules, on both Workers).
- Live: the after reading is a `curl -I` on a `.webp` and a `.css` once the
  merge deploys; the run record carries it.

## Expected effect, honestly sized

Small. It removes one revalidation round trip per image, font or clip on
pages not served by the service worker (showcase stills on the hub and
landing pages, fonts, icons, post figures), for a day after the first view.
It does nothing for the pay-app front doors, which load no images.

## Not changed, ranked for the next run

1. **`site-perf-hashed-modules`** (12 h): the real lever for pages outside
   the service worker. A `/h/` directory of content-hashed copies of
   `pf-*.css`/`pf-*.js`, served `immutable`, with HTML rewritten to point at
   them, keeps the original URLs (which other sites embed) revalidating.
   Many `build.test.mjs` assertions name `pf-chrome.css` literally, so budget
   for those.
2. **The hub's inline script** is 75.7 KB raw, and about 57 KB of it is the
   saved-bids, backup and offline-category code, which only does anything for
   a visitor with saved bids. Loading it as a module only when
   `portfolio-saved-bids` is in `localStorage` would cut roughly a quarter of
   the hub's transfer. About 15 tests in `build.test.mjs` slice that code out
   of the hub HTML, so they would need to read the new module instead.
3. `site-perf-sw-cache-churn`: still open. Since warm tool pages come from the
   worker's cache, how often a deploy throws that cache away matters more
   than headers.
