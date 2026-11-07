---
kind: analysis
date: 2026-11-07
tagged: auto
---
# Site performance: the first live measurements (2026-11-07)

The owner, 2026-11-07, in a session: "work item on the repo performance and
reliability engineering on the site. lots of painfully slow load speeds and
downtime". The `site-performance` direction already existed (2026-11-06,
[baseline report](2026-11-06-site-performance-baseline.md)), but that run
could not reach the live site. This one could. This report gives the numbers
and what they changed.

## What was measured

- **Uptime and latency:** `python3 platform/ci/site_probe.py probe` (new in
  this PR) against https://marisstella.app from a cloud session (Cloudflare
  answered from IAD, Ashburn). Eight paths, four on each Worker. Each request
  opens a fresh connection and gets one try, with no retries. There were 139
  rounds between 03:15 and 04:03 UTC, 1,112 requests in all. Raw history:
  [`docs/data/site-probe/2026-11-07-cloud-session.jsonl`](../data/site-probe/2026-11-07-cloud-session.jsonl).
  Four deploys went live during the window, seen as new `version.json`
  shas: `ebe05a31` 03:23, `50f76cd0` 03:26, `b54f49f9` 03:41 and
  `ffd89b7c` 04:02.
- **Page loads:** Playwright Chromium against the live site, cold and warm,
  unthrottled and with CDP throttling (150 ms, 1.6 Mbps).
- **Headers:** `curl -D -` on pages and assets.
- **Module preload A/B:** a local build of this branch served over local
  HTTP/2 with 150 ms added to every response. Each page was loaded twice with
  its preload links and twice with them stripped.

## Findings

**1. No downtime in this window, including across four deploys.**

| path | Worker | n | ok | TTFB p50 | TTFB p95 | total p95 | max |
|---|---|---|---|---|---|---|---|
| `/` | site | 139 | 100% | 172 ms | 400 ms | 426 ms | 489 ms |
| `/wall-framing-takeoff/` | site | 139 | 100% | 169 ms | 344 ms | 384 ms | 420 ms |
| `/pf-site.css` | site | 139 | 100% | 150 ms | 344 ms | 345 ms | 458 ms |
| `/version.json` | site | 139 | 100% | 152 ms | 363 ms | 363 ms | 417 ms |
| `/writing/` | shard | 139 | 100% | 163 ms | 349 ms | 368 ms | 394 ms |
| `/writing/what-a-tack-costs/` | shard | 139 | 100% | 156 ms | 351 ms | 351 ms | 2,006 ms |
| `/research/` | shard | 139 | 100% | 161 ms | 360 ms | 365 ms | 588 ms |
| `/research/marine-hull/` | shard | 139 | 100% | 178 ms | 348 ms | 396 ms | 750 ms |

Every request answered 200 and all but one finished inside 0.75 s.
Requests routed through the shard Worker were no slower than plain static
files. **This does not rule out the downtime the owner sees.** The window
was 03:15 to 04:03 UTC, three hours after the free plan's daily reset of its
100,000 Worker requests. That is the time of day least likely to show the
leading hypothesis, the daily budget running out under `/writing/` and
`/research/` (`site-perf-worker-budget`). It was also a single vantage point
for under an hour. The scheduled probe (`site-perf-uptime-probe`) is what
can settle it: hourly, all day, including 18:00 to 23:59 UTC.

The first runs probed the paths in a fixed order, and `/` came out 2.5 times
slower (TTFB p50 360 ms). That was an artifact. The first connection of each
round paid the proxy's warm-up, and `/` was always first. Called alone, `/`
answers in 150 ms like everything else. `site_probe.py` now shuffles the
order every round, and the table above mixes 17 fixed-order rounds with 120
shuffled ones.

**2. The slow pages are tool pages, and the cause is in the browser, not
the edge.** Live, unthrottled, with Chromium:

| page | requests | DOMContentLoaded cold | warm |
|---|---|---|---|
| `/writing/what-a-tack-costs/` | 4 | 0.31 s | 0.23 s |
| `/writing/` | 4 | 0.44 s | 0.37 s |
| `/` | 5 | 0.82 s | 0.44 s |
| `/wall-framing-takeoff/` | 45 | 1.74 s | 1.48 s |

Throttled, `/wall-framing-takeoff/` took 3.1 s cold and 2.4 s warm. A warm
visit barely helps for two reasons:

- **Every file is served `cache-control: public, max-age=0,
  must-revalidate`.** That includes CSS, fonts, icons and every `.mjs`
  module (checked on `/`, `/pf-site.css`, `/favicon.svg`, `/catalog.json`,
  `/sw.js` and the section indexes). So every repeat view revalidates every
  file. Compression is fine: zstd, gzip and brotli are all offered.
- **Module imports form a waterfall.** A browser learns what a module
  imports only after that module arrives. In this branch's build, 211 pages
  have a static import chain two or more levels deep. The deepest is 11
  levels (`/shed-designer/`, `/ai-bookkeeper/`), then 10
  (`/ai-bookkeeper/tax-calendar.html`), 8 (`/shed-designer/hoa-packet.html`)
  and 6 (`/einvoice-preflight/`, `/open-house-plans/`, `/sales-agent/`).
  With `max-age=0`, each level costs one round trip, cold or warm.

**3. Fixed in this PR: module preload.** The build now adds
`<link rel="modulepreload">` for every module in a page's static import
graph (`platform/pages/preload.mjs`, before the offline layer hashes the
pages): 1,515 links on 211 pages, at most 80 per page (none needed more
than 58). It adds no new requests: these are the same files, fetched at
the same time instead of one level at a time. Over HTTP/2 with 150 ms per
response, DOMContentLoaded (mean of two loads):

| page | chain | modules | before | after | change |
|---|---|---|---|---|---|
| `/ai-bookkeeper/tax-calendar.html` | 10 | 29 | 1,005 ms | 394 ms | −61% |
| `/einvoice-preflight/` | 6 | 44 | 1,033 ms | 428 ms | −59% |
| `/ai-bookkeeper/` | 11 | 51 | 797 ms | 454 ms | −43% |
| `/shed-designer/` | 11 | 58 | 1,573 ms | 1,015 ms | −35% |
| `/wall-framing-takeoff/` | 4 | 38 | 978 ms | 694 ms | −29% |

No page errors either way. The same A/B over HTTP/1.1 gained only about
10%, because Chromium opens six connections per host and queues the rest.
The live site speaks HTTP/2, so the HTTP/2 numbers are the relevant ones.
`check.mjs` passes on the build (7,438 pages, no dead links), as do the
builder's suites (`build`, `offline`, `check`, `build-determinism`,
`preload`: 422 tests).

**4. The offline cache is thrown away on almost every deploy.**
`offlineCacheName` (`platform/pages/build.mjs`) hashes every file in the
build, and `activate` deletes every other cache. The site deploys every few
minutes (four in this 48-minute window), so any visitor whose service worker
installed before the last blog post loses the whole cache on the next visit.
Their navigations are also cache-first, so they see the previous build's page
first. That is new task `site-perf-sw-cache-churn`.

**5. Cloudflare's browser integrity check blocks Python's default
User-Agent.** `Python-urllib/3.x` gets a 403 with `error code: 1010`.
`python-requests`, Go, wget, node-fetch, axios, Slack's and Facebook's
link expanders, Feedly and an empty User-Agent all get 200. The repository's
own checkers set their own User-Agent, so nothing here is broken. Still,
a script that "can't reach the site" may simply have been blocked for its
User-Agent, and that is not downtime.

**6. Deploy failures are not Cloudflare failures.** The six most recent
`failure` runs of `portfolio-pages.yml` on `main` failed at "Deploy to GitHub
Pages" (the old address's redirect pages; four runs) or "Check blog post
front matter" (two). Neither stops the Cloudflare site from serving.

## Tasks (in `portfolio/work/tasks.yaml`)

- `site-perf-modulepreload`: **done in this PR.**
- `site-perf-uptime-probe`: the script landed. Still needed: an hourly
  workflow (control plane, owner approval) and a history store off `main`.
- `site-perf-asset-cache-headers` (new): a lifetime of a day or more for
  images and fonts, which can't break a page by being stale.
- `site-perf-hashed-modules` (new): content-hashed module and CSS URLs
  served `immutable`, so a warm tool-page visit makes no module requests.
  Long caching without hashed URLs would be unsafe: new HTML that imports an
  old cached `engine.mjs` breaks the whole module graph.
- `site-perf-sw-cache-churn` (new): finding 4.
- `site-perf-worker-budget`: still the leading downtime hypothesis, still
  waiting on Workers analytics access. The owner can open Workers & Pages,
  then `monorepo-projects-site-shard`, then Metrics, and read the daily
  request count against the 100,000 limit.

## Reproduce

```
python3 platform/ci/site_probe.py probe --out probe.jsonl --rounds 120 --interval 20 --quiet
python3 platform/ci/site_probe.py report docs/data/site-probe/2026-11-07-cloud-session.jsonl
node platform/pages/build.mjs --out=dist      # prints "Module preload: N link(s) on M page(s)"
node --test platform/pages/preload.test.mjs
python3 platform/ci/test_site_probe.py
```
