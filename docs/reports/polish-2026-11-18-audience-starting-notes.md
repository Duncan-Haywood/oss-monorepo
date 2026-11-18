---
kind: polish
topics: [design, seo]
date: 2026-11-18
---
# Polish: audience starting notes capped at 42 words; retirees' first card on screen one

Date: 2026-11-18. Track: polish/0. Picked item 1 of "Still weakest" in
`polish-2026-11-18-audience-intros.md` ("for-retirees is still the tallest"). This session
started on item 2 of `polish-2026-11-18-homeowners-audience.md` in parallel with PR #17145, which
landed first; this PR was rebased onto it and keeps only what #17145 did not do.

## Measured (local build, Chromium, 390 × 844)

#17145 measured the top of the `.start-here` section. That is the "Start here" heading, about
75 px above the first tool card. Measured at the first `.start-grid li`, retirees was still at
846 px after #17145, past the 844 px fold: the heading showed, the tool did not.

| page | before #17145 | after #17145 | after this PR |
|---|---:|---:|---:|
| for-retirees | 951 | 846 | 820 |
| for-parents | 951 | ~819 | 768 |
| for-homeowners | 978 | 821 | 821 |
| for-job-changers | 873 | 794 | 794 |

All 26 audience pages with a Start here row: 686 to 821 px. `scrollWidth` 390 on all.
(The "after #17145" column comes from patching main's wording into a full local build's four
`dist` pages with the build's escaping, the same way as the last column.)

## What changed

- `platform/pages/audiences.mjs`: retirees `starting` 42 → 34 words, parents `starting` 45 → 33,
  retirees `intro` 50 → 45 (drops "subsidy", "which account to draw from first" → "withdrawal
  order"). The jurisdiction sentence is untouched.
- `platform/pages/audiences.test.mjs`: `starting` ≤ 42 words (was 50); the longest is roofers' 41.

## Still weakest, and what I would do next

1. **Turn the measurement into a check** (carried over, `polish-2026-11-18-audience-intros.md`
   item 2), and measure the first `.start-grid li` or `main .card`, not the section: the heading
   and the tool differ by ~75 px, which was the whole retirees gap.
2. **Five audience pages have no Start here row**: childcare, ebay-sellers, etsy-sellers,
   photographers, pool-hot-tub (`renderAudienceLead` returns '' when `start` is empty). They open
   straight into the card list; consistent with the others or not, someone should decide.
3. Carried over from `polish-2026-11-18-audience-intros.md`: item 3 (renters page; household tools
   in `backoffice`; the `starting` note's business call-out styling; llms.txt headroom).
