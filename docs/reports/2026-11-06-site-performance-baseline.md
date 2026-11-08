---
kind: analysis
date: 2026-11-06
tagged: auto
---
# Site performance: baseline and leads (2026-11-06)

The owner, 2026-11-06, in a session: "Let's add to the tasks performance
engineering on the website. Lots of downtimes and painfully slow load speeds
needs to be fixed. Not sure what happened there."

This report is the source for the `site-performance` direction in
`portfolio/work/directions.yaml`; its tasks are in `portfolio/work/tasks.yaml`.

## What could and could not be measured

- **The live site could not be reached from the cloud session.** The egress
  proxy answers 403 to `CONNECT marisstella.app:443`, so there is no live
  timing or uptime number in this report. None is guessed.
- **Deploys:** the last 60 `portfolio-pages.yml` runs on `main` (2026-11-05
  23:10 to 2026-11-06 04:25 UTC), read through the GitHub API.
- **Page weight:** a local build of `main` at `ebbba998`
  (`node platform/pages/build.mjs`, 1 min 43 s), measured with the new
  `node platform/pages/page-weight.mjs dist`.

## Findings

**1. The two index pages people land on from the nav are megabytes.**

| Page | HTML | gzip | Why |
|---|---|---|---|
| `/writing/` | 2,325 kB | 383 kB | every one of 2,489 posts listed on one page |
| `/research/` | 1,441 kB | 242 kB | 1,065 `<article>` cards on one page |
| `/guides/` | 948 kB | 195 kB | 285 kB of inline script |
| `/compare/` | 414 kB | 78 kB | 162 kB of inline script |
| `/custom-development/R-000N/` | about 326 kB each | about 89 kB | not yet looked at |
| front page | 218 kB | 55 kB | 89 kB inline script, 36 kB inline style |

The median page is 19 kB (p90 33 kB, p99 74 kB), so the slowness is
concentrated: 28 pages are over 150 kB, and the worst two are the section
indexes. A 2.3 MB HTML document has to be parsed and laid out before the page
settles, which is slow on a phone whatever the network.

**2. Over a third of the site runs Worker code on every request.** 8,241 of
22,812 files (36%) sit under `research/`, `writing/` and `dev/`, which
`router.mjs` forwards to the shard Worker. Those requests pass through two
Workers instead of being served as plain static assets, and they count
against the free plan's 100,000 Worker requests a day. Past that, Cloudflare
fails those requests until 00:00 UTC; nothing is billed. Every post's share
card and every research figure counts, as do crawler hits on the 3,693 hub
sitemap URLs. **Leading hypothesis for "downtime", not yet confirmed:**
`/writing/` and `/research/` stop answering on busy days while the rest of
the site keeps working. Cloudflare's Workers analytics (per-day invocations and
errors for both Workers) would confirm or rule it out. The shard only exists
because the site is past 20,000 files per Worker: 5,127 of the files are
`share-card.png` and 4,234 are `.mjs`.

**3. The site redeploys about every ten minutes.** 25 successful Cloudflare
deploys in about five hours (plus 25 replaced pending runs). Each deploy
uploads the shard first and then the site Worker, about 10 s apart, and
announces to IndexNow. The Cloudflare deploy jobs read were green. The six
`failure` runs read in detail failed at "Deploy to GitHub Pages" (the
redirect pages for the old address), not on Cloudflare. Whether redeploying
this often causes cold edge caches or brief errors has not been measured.

**4. The deploy check would not notice slowness or flaky errors.**
`verify-live.sh` retries every request up to five times, so it passes on a
site that answers only some of the time, and it times nothing.
`check_site_fresh.py` checks build age, not speed.

## What to do, in order

The tasks are in `portfolio/work/tasks.yaml` under `site-performance`:

1. `site-perf-uptime-probe`: measure status, time to first byte and total
   time with no retries, from outside, on a schedule, and keep the history
   in a file. Without it every fix below is a guess.
2. `site-perf-worker-budget`: read the Workers analytics to confirm or rule
   out finding 2.
3. `site-perf-paginate-indexes`: split `/writing/` and `/research/` into
   pages under 150 kB.
4. `site-perf-one-worker`: get under 20,000 files so one Worker serves
   everything as static assets and no request runs code.
5. `site-perf-inline-script`: move the inline script on `/guides/`,
   `/compare/` and the front page into cached files.
6. `site-perf-budget-check`: once the heavy pages are fixed, fail a PR run
   that adds a page over budget, using `page-weight.mjs --strict`.

## Reproduce

```
node platform/pages/build.mjs --out=dist
node platform/pages/page-weight.mjs dist          # the tables above
node --test platform/pages/page-weight.test.mjs
```
