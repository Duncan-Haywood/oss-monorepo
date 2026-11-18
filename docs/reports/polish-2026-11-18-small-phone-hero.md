---
kind: polish
topics: [design, accessibility]
date: 2026-11-18
---
# Polish: a tighter page hero on narrow phones (320 to 380 px)

Date: 2026-11-18. Track: polish/0. PR #17276. Picked item 2 of "Still weakest" in
`polish-2026-11-18-starting-under-start-here.md` ("320×640: 24 of 31 fail, most by 17 px ...
a phone-only `padding-block` tightening in `.pf-hero` would likely clear the 641s"). Open polish
PRs (#11730, #12397, #14012) don't touch the hero. Draft PR opened before the build.

## What changed

- `platform/pages/site-nav.mjs` (`SITE_HERO_CSS`, i.e. `pf-site.css`, every site-owned page with a
  `.pf-hero`): one `@media (max-width:380px)` block. The wrap's top padding and `--pf-hero-pull`
  26 → 18 px together (so the dark field still meets the nav; scoped with `.wrap:has(.pf-hero)`),
  hero padding 18/24 → 12/20 px, margin below 30 → 22 px, h1 margin 14 → 10 px, and the
  lede/dek 1.06rem/1.55 → 1rem/1.5 (17 px → 16 px, the body size every phone OS uses).
- `platform/pages/build.mjs` (`CATEGORY_STYLE`): at the same width, `.start-here` margin 28 → 22
  px and its sub-line margin 14 → 12 px.
- 390 px and wider: nothing changes (measured below, 0 px difference on every sampled page).

Why 380 and not 400: the 390×844 iPhone is the fold check's default screen and already passes
31 of 31; the 17 px lede reads well there. 380 catches the iPhone SE/mini (375) and 360/320
Androids, where the fold was being missed.

The lede is the big lever: the 17 px lede wrapped to 7 lines at 320 (184 px); at 16 px it is
6 lines of 24 px (144 px). The spacing trims add about 30 px.

## Measured (full local builds, `fold-check.mjs` with WIDTH/HEIGHT, Chromium; before = main at d5a79af54)

| screen | before: pages failing | after: pages failing |
|---|---|---|
| 320×640 | **24 of 31** | **6 of 31** |
| 375×667 | 6 of 31 | 3 of 31 |
| 360×780 | 3 of 31 | 1 of 31 (childcare, 777 vs 764) |
| 390×844 | 0 of 31 | 0 of 31 |

First tool card, 320×640: landscapers 641 → 569 px (now its title is on screen, not only the
border), hvac 610 → 560, retirees 750 → 671, childcare 900 → 832.

Hero height at 320 on other site-owned pages (no fold rule; looked at the screenshots): About
481 → 416, Writing 475 → 391, Stories 553 → 528, Updates 572 → 498. At 390 all four identical
before and after. `scrollWidth` equals the viewport on all seven sampled pages at both widths.

Checks: `node platform/pages/check.mjs` ("looks publishable: 1395 products, 51 category pages,
11472 pages, no dead links"); `node --test 'platform/pages/*.test.mjs'`: 1816 tests, 1816 pass.

## Still weakest, and what I would do next

1. **The five short audience pages** (childcare 832, photographers 821, pool-hot-tub 781 at
   320×640; etsy-sellers 668): fewer than 8 tools, so no Start here row; the `starting` note
   *and* the jump chips sit above the first card. This is item 1 of
   `polish-2026-11-18-starting-under-start-here.md`, still open; at 320 the note alone is about
   150 px. Moving it below the first subgroup on these pages is the next lever.
2. **Homeowners (695) and retirees (671) at 320×640**: their ledes are the longest (9 lines at
   16 px). A copy edit to about 40 words would clear both; the content, not the CSS, is the cost.
3. **Register the fold check for more than one screen size.** `fold-check.mjs` takes WIDTH and
   HEIGHT but nothing runs it at 320×640 or 375×667; registering it in CI is control plane
   (carried over, `polish-2026-11-18-fold-check.md` item 2).
