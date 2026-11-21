---
kind: polish
topics: [design, accessibility, software-for-routine]
date: 2026-11-21
---
# Polish 2026-11-21: a fold baseline for venture pages; the last 9 csv-check pages fit 390×844

Picked item 3 of "Still weakest" in `polish-2026-11-21-csv-check-fold.md`
(`venture-fold.mjs` has no baseline) and item 1 of the same report (9 csv-check
pages below 390×844). `polish_queue.py` showed neither claimed; draft PR #18087
claimed them before the build finished.

## What changed

1. **`venture-fold.mjs --check / --write-baseline`** and
   **`venture-fold-baseline.json`** (full build of main, 390×844): 1,403 pages
   measured, 1,383 with a field, 367 below the screen, 358 after this run.
   `--check` fails on a page new to the list or one more than 48 px
   (`BASELINE_SLACK_PX`) deeper than recorded, and judges only the pages it
   measured, so `--match <family>` on an `--only` preview works. Helpers
   `belowFold`, `compareBaseline` + a test that the committed file is well
   formed (`venture-fold.test.mjs`, 6 tests). README section extended.
2. **29 csv-check pages**: "The file is read in this browser tab and never
   leaves your device." dropped where the card note already says the page never
   uploads (6 pages), else shortened to "Read in this tab; nothing is
   uploaded." (22; irs-iris rewrites its note, keeping "unverified" in bold).
3. **6 caution notes moved into the first card, under the buttons, still
   visible**: About consent (brevo, klaviyo, mailchimp, shopify-customer),
   About pay rules (payroll-hours), About the counts (shopify-inventory). The
   previous report said "don't fold the consent note"; moving it keeps it
   unfolded and puts it beside the action.
4. **1099-vendor-csv-checker**: the recognised-headers list moved from above the
   year select to under the paste box.
5. Baseline: the 9 fixed pages' keys deleted by hand (an `--only` preview
   cannot `--write-baseline`); `--check --match csv-check` on the preview passes.

## Measured (`venture-fold.mjs`, Chromium; built main vs `--only` preview)

| Screen | first card on screen | first field on screen | median field top |
|---|---:|---:|---:|
| 360×844 | 25 → 29 | 17 → 21 | 810 → 806 |
| 390×844 | 27 → 29 | 20 → 29 | 775 → 760 |
| 1280×844 | 29 → 29 | 29 → 29 | 536 → 532 |

Screenshots (390×844, 2x): `img/polish-csv-notes-{before,after}-brevo-390.png`.

## Still weakest, and what I would do next

1. **358 venture pages start their first field below 390×844** (the baseline).
   `jq -r '.below|to_entries|sort_by(-.value)[:30][]|"\(.value) \(.key)"' platform/pages/venture-fold-baseline.json`
   ranks them; group by template (the answer-lead finance calculators were 48 of
   378 in the earlier survey) and fold a family per run, deleting its keys.
2. **`--check` is not in CI** (Playwright is not a dependency). The pages
   workflow builds the whole site; running `--check` after the build would make
   the ratchet automatic. That edit is to `.github/workflows/` (control plane,
   CODEOWNERS): its own small PR.
3. **At 360 px eight csv-check pages still need a scroll** (vendor disclaimer
   notes of 30–45 words). Fine for now; a shorter shared disclaimer would fix it.
4. Carried over: the card intro note between heading and input on journal pages
   (`polish-2026-11-21-eyebrow-names.md` item 2), 117 heroes over 80 words (item 4).
