---
kind: polish
topics: [design, accessibility]
date: 2026-11-18
---
# Polish: the starting note moves under "Start here" (audience pages)

Date: 2026-11-18. Track: polish/0. PR #17223. Picked item 1 of "Still weakest" in
`polish-2026-11-18-fold-check.md` ("360×780 is mostly a miss ... move the `starting` note below
the Start here row"). Open polish PRs (`polish` in titles: #14012) don't touch audience pages. I
opened the draft PR before the build, as that report's item 3 asked.

## What changed

- `platform/pages/build.mjs`: `renderAudienceLead` takes `starting` and prints the note after the
  `start-grid` cards, inside the Start here section. `renderAudiencePage` passes it there and
  leaves it out of the hero when there is a Start here row (8+ tools). Pages with no Start here row
  keep it in the hero, as before. One CSS line (`.start-here .starting { margin-top: 16px; }`).
  The note is in the DOM where it is shown: no CSS reordering, so screen readers and the visual
  order agree, at every width.
- `platform/pages/audiences.test.mjs`: one test (note once, after the cards, not in the hero;
  stays in the hero with four tools). It fails on main's `build.mjs`.

Why the move reads right and not only measures right: every note says "run a few sample jobs
through these" or names the calculators to use. Under the cards, "these" points at something
already on screen.

## Measured (full local builds, before = main at 4c482af79, `fold-check.mjs`, Chromium)

| screen | before: pages failing | after: pages failing | deepest first card, before → after |
|---|---|---|---|
| 390×844 | 0 of 31 | 0 of 31 | homeowners 821 → childcare 766 |
| 360×780 | **20 of 31** | **3 of 31** | homeowners 903 → childcare 818 |
| 320×640 | not measured | 24 of 31 | (after: childcare 900) |

At 360×780 roofers went 847 → under 764, homeowners 903 → under 764. The three still failing
(childcare 818, pool-hot-tub 796, photographers 766) have fewer than 8 tools, so no Start here row:
their first card is in `main` after the jump chips, and they were unchanged by this PR.

## Still weakest, and what I would do next

1. **The three short pages at 360×780.** Childcare, pool-hot-tub and photographers carry the note
   in the hero *and* a row of jump chips before the first card. On a short page the note could go
   just above `main` instead; measure first, the chips may be the larger cost.
2. **320×640 (iPhone SE first gen, small Androids): 24 of 31 fail**, most by 17 px (641 vs 624).
   The hero padding and the 1.06rem lede are the next lever. A phone-only `padding-block`
   tightening in `.pf-hero` (site-nav.mjs) would likely clear the 641s across all pages at once.
3. Carried over: register `fold-check` in `browser-checks-ci.yml` (control plane; a separate
   PR), the renters page's fourth tool, the "Jump to all N tools" link in the hero count line.
