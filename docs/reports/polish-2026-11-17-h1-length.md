---
kind: note
topics: [polish, seo, design]
date: 2026-11-17
---
# Polish: long question h1s on a phone (2026-11-17)

Date: 2026-11-17. Track: polish/0. Picked item 1 of "Still weakest" in
`polish-2026-11-17-hero-headings.md` ("Long question h1s on a phone"). Open PRs searched
(`list_pull_requests`, open): none touch tool-page h1s or `hero-heading.mjs`.

## What was wrong

The previous run capped h1 font sizes, which fixed the laptop view. On a phone the problem was
length, not size: at 390 px a 28.8 px h1 fits about 20 characters a line, and 17 tool pages had a
101 to 125-character h1, most of them two questions joined by "and". They wrapped to 5 or 6 lines,
155 to 193 px, before the lede and the form. Nine of the 17 asked "..., and how much cash does the
ramp-up eat?" or a similar second question that the lede right under the heading already answers.

## What changed

- **17 h1s shortened** in `ventures/<slug>/index.html`, with `llms.txt` line 1 changed to match.
  The rule was the one the hero-headings run used for the two mobile-route pages: keep the first
  question, let the lede carry the second. Every dropped clause is named in that page's lede
  (ramp-up and payback, private vs school vs rented room, direct vs marketplace vs charter,
  underpaying current clients, the unsold-goods disclosure). The `<title>`, meta description,
  JSON-LD and FAQ are untouched, so the query words a search engine reads stay where they were;
  CBAM's h1 dropped "EU carbon border levy", which its `<title>` and `og:title` still carry.
- **`MAX_H1_CHARS = 100`** and `longHeadings()` in `platform/pages/hero-heading.mjs`, with a test
  in `hero-heading.test.mjs` (no browser, runs in the pages suite): no `ventures/*/index.html` h1
  may pass 100 characters. No exceptions list.

## Measured (Playwright, built pages, before and after, same 17 pages)

| page | characters | lines at 390 | h1 px at 390 | h1 px at 1,280 |
|---|---|---|---|---|
| bookkeeping-client-fee-calculator | 105 → 58 | 6 → 4 | 193 → 129 | 153 → 102 |
| hydroponic-farm-profit-calculator | 125 → 85 | 6 → 4 | 187 → 124 | 145 → 97 |
| indoor-play-center-profit-calculator | 117 → 77 | 6 → 4 | 187 → 124 | 145 → 97 |
| kombucha-brewery-profit-calculator | 118 → 78 | 6 → 4 | 187 → 124 | 145 → 97 |
| pet-boarding-daycare-profit-calculator | 118 → 78 | 6 → 4 | 187 → 124 | 145 → 97 |
| padel-club-profit-calculator | 115 → 75 | 6 → 4 | 187 → 124 | 145 → 97 |
| bowling-center-profit-calculator | 118 → 78 | 6 → 4 | 187 → 124 | 145 → 97 |
| music-teacher-studio-profit-calculator | 113 → 53 | 6 → 3 | 187 → 93 | 145 → 97 |
| boat-rental-fleet-profit-calculator | 110 → 56 | 6 → 3 | 187 → 93 | 145 → 97 |
| mushroom-fruiting-room-planner | 109 → 78 | 5 → 4 | 155 → 124 | 145 → 97 |
| freelance-editor-quote-calculator | 108 → 82 | 5 → 4 | 155 → 124 | 145 → 97 |
| private-pilot-training-cost-calculator | 105 → 78 | 5 → 4 | 155 → 124 | 145 → 97 |
| horse-boarding-stall-profit-calculator | 101 → 69 | 5 → 3 | 155 → 93 | 145 → 97 |
| pet-waste-removal-route-calculator | 101 → 79 | 5 → 4 | 155 → 124 | 145 → 97 |
| dry-cleaner-profit-calculator | 103 → 65 | 5 → 4 | 155 → 124 | 145 → 97 |
| eu-espr-readiness-checker | 104 → 81 | 5 → 4 | 155 → 124 | 145 → 97 |
| cbam-cost-estimator | 103 → 75 | 5 → 4 | 155 → 124 | 145 → 97 |

Total h1 height on these 17 pages: 2,929 → 2,020 px at 390 (−31%), 2,473 → 1,654 px at 1,280
(−33%). No page's h1 got taller. A first pass at 93 characters left three pages at 5 lines
(horse boarding, pet waste, mushroom); a second, shorter wording took each to 3 or 4.

How measured: `node platform/pages/hero-heading.mjs --slugs=<the 17> --json=...` against a local
build; the "after" numbers patched the 17 built pages' h1 with the new source text (the build was
still running), so the CSS and the rest of each page are the deployed ones.

## Still weakest, and what I would do next

1. **h1s of 81 to 100 characters** (90 pages, 31 of them over 90; e.g. uk-pension-annual-allowance-calculator 99,
   fishing-charter-trip-pricing-calculator 100) still wrap to 5 lines at 390 when the font is
   28.8 px. Lowering `MAX_H1_CHARS` to 90, then 80, with the same "first question, lede carries
   the rest" rewrite, would finish the job; `longHeadings(undefined, 80)` lists them.
2. **Lower `MAX_H1_PX[390]` from 200 to 160.** A full scan after this change (all 1,364 pages,
   after the local build finished) has 0 over the current budget but 16 pages at 161 to 192 px at
   390. The two tallest are font, not length: npm-deployment-evidence (67 characters, 4 lines,
   192 px) and freelance-retainer-calculator (66, 4 lines, 188 px) set a large h1 floor or line
   height for phones. The other 14 are 161 px, 5 lines of 71 to 91 characters (the pricing
   calculators: email-api, object-storage, search-api, training-gpu, uptime-monitoring,
   video-hosting...), which item 1 covers.
3. Carried over from `polish-2026-11-17-hero-headings.md`: item 2 (shared venture stylesheets the
   static h1 test does not read) and item 3 (72 ledes at 91 to 120 words; the ADA related list's
   line height).
