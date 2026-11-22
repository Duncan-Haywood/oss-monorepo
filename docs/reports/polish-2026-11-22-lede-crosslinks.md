---
kind: polish
topics: [design, seo]
date: 2026-11-22
---
# Polish 2026-11-22: lede cross-links on the 1099 pair and the S-corp page; fold probe ignores the footer

Follows `polish-2026-11-22-header-crosslinks.md` ("Still weakest", items 1 and 2).

## What changed

1. **`venture-fold.mjs` no longer counts the footer as a form.** Many venture pages keep
   `<footer>` inside `<main>`, and the footer's "Don't count my usage" `#optout` checkbox was
   the "first field" on pages with no form above it. Fields and fallback labels inside
   `FIELD_EXCLUDE` (`footer, #optout`) are skipped. testimonial-keeper (3,803 px in the
   baseline) now has no field and drops out. monastery-site (3,399) stays: its site-builder
   form really is that far down (a product page, not a calculator; not touched here).
2. **Three pages without a `<header>`**, where the earlier check could not see the stack:
   every muted `p.privacy` note in the lede (between `<main>` and the first card) that links to
   another tool moved word for word into a `section.card.related-links` "Related guides and
   tools" card before "Common questions" (1099-k-threshold-checker 3 notes,
   1099-vendor-tracker 2, s-corp-reasonable-compensation-calculator 1). The "See <guide>,
   <comparison> ..." sentence that closed each page's "After using this, you can now" box
   moved into the same card as its first line. No text cut; every link still on the page and
   the pages' own suites (which assert the guide links) pass: 36, 37, 41 tests.
3. **Check:** `header-crosslinks.test.mjs` gains `ledeCrosslinkNotes`, the same at-most-1 rule
   for `p.privacy` notes before the first `<section>` on pages with no header. It fails on main
   (`1099-k-threshold-checker: 3`, `1099-vendor-tracker: 2`) and passes now. No other venture
   page has more than one.
4. **Ratchet:** `venture-fold-baseline.json` edited by hand (a `--write-baseline` needs a full
   build): 1099-vendor-tracker and testimonial-keeper removed; 1099-k-threshold-checker
   1353 → 958, s-corp 1456 → 1152 (tightened, so a regression to the old depth fails).

## Measured (`venture-fold.mjs`, Chromium, `--only` previews of main and of this branch)

| page | 360 field | 390 field | 1280 field |
|---|---:|---:|---:|
| 1099-vendor-tracker | 1280 → 825 | 1213 → 801 | 777 → 612 |
| 1099-k-threshold-checker | 1496 → 1033 | 1353 → 958 | 866+ → 651 |
| s-corp-reasonable-compensation-calculator | 1603 → 1254 | 1456 → 1152 | → 716 |

First field on the first screen (limit 828 px): 390 wide 0 → 1 of 3; 1280 wide all 3 now.
Screenshots (390×844, 1x): `img/polish-lede-crosslinks-{before,after}-vendor-390.png`.

## Still weakest, and what I would do next

1. **1099-k-threshold-checker (958 at 390)**: the answer lead (keep: AEO) plus a 5-line intro
   listing seven platforms. Shortening the intro's platform list, or moving the intro under the
   lead's box as one sentence, would likely land it.
2. **s-corp (1152)**: the "Your numbers" card opens with a 6-line note on what "compensation
   pool" means before the first input. Move it to a hint under that field (`<small>` inside the
   label) rather than above the form.
3. **Next by depth after the footer fix** (re-run `--check` on a full build to refresh):
   open-robot-mower 1,513, devsec-toolkit 1,428, bank-statement-pdf-to-csv 1,395 (a 5-line
   note above the file picker), patreon-fee-calculator 1,365 (its `<header>` holds the answer
   lead and a long eyebrow; the `main.layout` has no `.card`, so "first card" reads `-`).
4. A full `--write-baseline` on the next full build, to pick up every page the footer fix
   changes (only these pages were remeasured here).
