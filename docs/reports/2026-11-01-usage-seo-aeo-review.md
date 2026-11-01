# Usage, SEO and AI-search review, 2026-11-01

Owner request (2026-11-01): "look at the usage stats from cloudflare and also
do a look at the seo and aseo we have going so far. blog post report on the
topic." Blog post: [`docs/posts/2026-11-01-nine-days-of-usage-and-what-search-sees.md`](../posts/2026-11-01-nine-days-of-usage-and-what-search-sees.md).

Everything below was measured in this session (2026-11-01, about 04:00 UTC)
unless it says otherwise. Commands are given so the next run can repeat them.

## 1. Usage

### Where the numbers come from

| Source | File | State on 2026-11-01 |
|---|---|---|
| First-party page beacon (`platform/edge` Worker) | `portfolio/usage/site-visits.json` | Live. Re-pulled this session with `COUNTER_URL=https://monorepo-projects-edge.duncan-andrew-haywood.workers.dev node platform/counter/pull.mjs`; this PR commits the result. |
| Cloudflare edge analytics (`platform/counter/pull-cloudflare.mjs`) | `portfolio/usage/cloudflare-analytics.json` | **Never landed.** The script ran in CI on 2026-10-31 and wrote the file ("7 day(s) pulled, 2 dataset error(s)"), then the commit was rejected: `GH013: Repository rule violations ... Changes must be made through a pull request` (run 41172448053). No Cloudflare token is available to sessions, so it cannot be pulled by hand either. |
| GitHub repo traffic | `portfolio/usage/github-traffic.json` | Never written: `TRAFFIC_TOKEN` is not set (the workflow says so). |
| Feedback form | `portfolio/usage/site-feedback.json` | 1 message on file, 0 new. |

**The daily pull is broken by the new main ruleset.** `.github/workflows/site-usage-pull.yml`
pushes straight to `main`; the 2026-10-30 run (before the ruleset) succeeded,
the 2026-10-31 run failed, and every later run will fail the same way. The fix
is a control-plane change (CI is in `.github/CODEOWNERS`), so it was left out
of this PR and queued as its own task: land the data on a branch or through a
PR, without adding a ruleset bypass.

### What the beacon says (2026-10-24 to 2026-11-01 04:00 UTC)

Page loads by browsers that ran the page script and did not opt out; not
people.

| Day | Loads | Pages |
|---|---:|---:|
| 10-24 | 13 | 4 |
| 10-26 | 7 | 4 |
| 10-28 | 4 | 3 |
| 10-29 | 6 | 4 |
| 10-30 (moved to Cloudflare) | 21 | 9 |
| 10-31 | 16 | 4 |
| 11-01 (4 hours) | 11 | 5 |
| **Total** | **78** | |

- Top pages: catalogue `c` 24, `ask` 17, `about` 13, `shed-designer` 9,
  `hearth-and-horizon` 4. Every other page had 1 or 2.
- Country (recorded since 10-30): US 36, PL 1. Device: desktop 37 of 37.
  Referring-site kind: other 2, github 1. Channel links (`?ref=`): none.
- Reading: the hub pages and an all-desktop, almost all-US audience are what
  the owner and deploy-checking agents produce. The beacon cannot tell them
  from strangers, so the honest statement is "single-digit page loads a day,
  an unknown share of them ours". One load from Poland and two from an
  unclassified referring site are the clearest outside traffic.
- Crawler beacons (headless browsers that run scripts): 4,410 on 10-30,
  12,384 on 10-31 (`bot:headless`), across 1,417 distinct pages. YandexBot:
  11. The most-rendered pages were `hearth-and-horizon` 569,
  `saints-by-candlelight` 234, `einvoice-preflight` 186, `ai-bookkeeper` 147,
  `ebay-fee-calculator` 112. Something rendered nearly every page on the
  site twice in two days; the beacon cannot say what (no browser string is
  stored). That is the question the Cloudflare file was built to answer.
- Cloudflare's dashboard figure for the first stretch (quoted in
  [the 2026-10-31 post](../posts/2026-10-31-our-first-day-on-cloudflare-was-mostly-bots.md),
  not re-measured here): 31.96k requests, 922 visits, 415 MB.

## 2. Search (SEO)

Measured against the live site with `curl`:

- `robots.txt`: `Allow: /` for every agent, and a `Sitemap:` line.
- `sitemap.xml`: a sitemap index of 1,322 child sitemaps (one hub plus one
  per product, 1,321). The hub sitemap lists 2,844 URLs: 1,652 writing, 1,093
  research, 46 comparison and 45 audience (`c/`) pages, plus the indexes.
  Product sitemaps carry `lastmod`.
- Every page sampled (home, `ebay-fee-calculator`, `hearth-and-horizon`,
  `c/for-roofers`) has a unique `<title>`, a meta description, a canonical on
  `https://marisstella.app/`, Open Graph tags and JSON-LD. Tool pages carry
  `SoftwareApplication` with an `Offer`, a `FAQPage` with 6 Q&A, and a
  `BreadcrumbList`; audience pages `CollectionPage` + `ItemList`; the home
  page `WebSite` with a `SearchAction`, and `Organization`.
- Old GitHub Pages URLs: `noindex`, a canonical to marisstella.app and a
  0-second meta refresh. That is the correct move for a host that cannot send
  a 301; search engines treat it as a redirect.
- Unknown page: real 404 status.
- IndexNow: the live snapshot has been announced (`python3 platform/ci/indexnow_state.py`),
  which reaches Bing, Yandex and the other participants. YandexBot is
  already crawling (beacon and dashboard both show it).
- **Gap: Google.** It does not take IndexNow; Search Console is still the
  owner's to set up (`decision_queue.py`). Until it is, there are no
  impression, query or ranking numbers for any engine in the repo. On-page
  SEO is in good shape; whether it ranks is unmeasured.
- Minor: no `/.well-known/security.txt` (404).

## 3. AI search (AEO / "ASEO")

- `GPTBot`, `ClaudeBot`, `PerplexityBot`, `CCBot`, `Google-Extended`,
  `Googlebot` and `bingbot` browser strings all get 200 for a tool page and for
  `llms.txt`: Cloudflare's AI-crawler block is not on.
- `llms.txt` (45.5 KB, 330 lines) and `llms-full.txt` (603 KB) at the root,
  plus per-product `llms.txt` files; tools-by-trade sections link the audience
  pages; the FAQ JSON-LD gives answer engines question-shaped text.
- **Fixed in this PR:** the root `llms.txt` "Tools that call the network"
  section was one ~50-name sentence that began "On Does your pinned workflow
  load something unpinned underneath it?, AI Bookkeeper: ...". Names ran
  together and none were linked. `platform/pages/build.mjs` now writes one
  linked line per tool, with the count.
- Not measured: whether any AI crawler has fetched `llms.txt`, or whether any
  assistant cites the site. The Cloudflare file's per-class `pages` list
  would show the first; nothing in the repo can show the second yet.

## What the next run should do

1. Land the usage-pull fix (queued task; owner approval needed, CI path).
2. After its first good run, read `cloudflare-analytics.json`: requests by
   client class (is `headless` one crawler or many?), and whether `gptbot` /
   `claudebot` fetched `llms.txt`.
3. Owner: Google Search Console (already in the decision queue) and
   `TRAFFIC_TOKEN` for GitHub traffic.
