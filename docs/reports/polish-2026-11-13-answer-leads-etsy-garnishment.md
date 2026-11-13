---
kind: polish
topics: [aeo, seo]
date: 2026-11-13
---
# Polish 2026-11-13: answer-first leads on etsy-profit-calculator and wage-garnishment-limit-calculator

**Why this item.** I screenshotted the hub, wall-framing-takeoff, /research/, /stories/ and a
post at 390 and 1280 px (full local build, 9,027 pages). None scrolled sideways, and the earlier
"still weakest" lists are mostly done or editorial. Two things looked wrong and were not:

- The hub's stat tiles read 738 / 46 / 140 / 739 under "Search 1,345 tools and 1,076 research
  projects". That was the count-up animation (`showcase.mjs`, 1.4 s, off under reduced motion)
  caught at 400 ms. The HTML holds 1,074 / 67 / 204 / 1,076. Nothing to fix. A screenshot script
  needs to wait about 1.5 s.
- 1,299 of 1,345 built `llms.txt` files named `duncan-haywood.github.io`. That only happens in a
  local build, which still takes the github.io default (PR #14596, open, changes it). Production
  passes `PAGES_BASE_URL`, and `rewriteOrigin` rewrites `.txt`. Live
  `marisstella.app/wage-garnishment-limit-calculator/llms.txt` names marisstella.app.

So I took the AEO job instead: two high-intent tools with no answer-first lead.

**Picked by** listing ventures whose slug matches fee, limit, threshold, etsy, amazon, walmart,
paypal, stripe or square and that have no `data-answer-lead` (35). I kept the two with a stable,
primary-sourced answer:

| tool | source read 2026-11-13 | figures |
|---|---|---|
| etsy-profit-calculator | help.etsy.com 360035902374 "Etsy Fee Basics"; 115015628847 "What are Payment Processing Fees" (US row) | $0.20, 6.5%, 3% + $0.25 |
| wage-garnishment-limit-calculator | dol.gov WHD Fact Sheet #30 (its table); 15 U.S.C. 1673 | 25%, $217.50 / $435 / $471.25 / $942.50, 50 to 65%, 15% |

Skipped: **walmart-marketplace-calculator**. `calc.mjs` calls its referral rates "illustrative
defaults ... not Walmart's live fee schedule", and Walmart's real schedule is tiered within
categories. A sourced lead would overstate it. Seller Help answered 503 and the Learn page is
JS-rendered. Probes: etsy.com/legal/fees 403; help.etsy.com 200; dol.gov 200; law.cornell.edu
200; uscode.house.gov 404 on the granule URL.

**Changed.**
1. `etsy-profit-calculator/calc.mjs`: `export const ETSY_US_FEES` (source comment), used as the
   `calculateOrder` defaults instead of four inline literals. No numbers changed (196 venture
   tests pass).
2. Lead `<p class="answer-source" data-answer-lead>` under each `h1`.
3. `llms.txt`: Etsy's no longer says the defaults are "not Etsy's current fee schedule". It says
   what they were checked against. Garnishment's gains a "federal limits" section, and its
   github.io link is now marisstella.app (the build rewrites it either way).
4. `answer-lead.test.mjs`: both slugs in `PILOTS`. The Etsy $3.78 example is computed with
   `calculateOrder`, and the garnishment floors with `protectedFloor`. A new test checks the
   leads' percentages too, which the shared check ignores: 50 tests pass.

**Measured** (venture pages served raw, Chromium, third-party blocked): lead at 16 px, no sideways
scroll at 390 or 1280. The lead is 288 / 273 px tall at 390 and begins 167 / 195 px from the top.
It pushes the existing intro down by that much; the first input was already below the fold on
both pages at 390. No ranking or citation change is measured or claimed.

## Still weakest, and what I would do next

1. **33 more high-intent tools have no lead** (same grep). Good next ones with stable primary
   sources: economic-nexus-threshold-tracker (state $100k / 200-transaction rules, per state's
   DOR), uk-sole-trader-vs-limited-company-calculator (HMRC rates). Avoid any whose rates the
   code calls illustrative.
2. **The Etsy intro under the lead is a 20-link paragraph** (about 1,100 px at 390). A short
   intro plus a "Questions this answers" list would read better. It is the page's internal-link
   hub, so keep every link.
3. **Screenshot scripts and the count-up**: `platform/pages/showcase/capture.mjs` and any hub
   capture should wait past 1.4 s or emulate reduced motion, or the tiles show partial counts.
4. Carried over: topic-page titles four lines on phones, `.pager` defined twice in the writing
   STYLE, the ticker's third line at 320 px.
