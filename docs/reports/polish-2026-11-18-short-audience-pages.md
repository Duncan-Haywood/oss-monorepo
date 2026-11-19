---
kind: polish
topics: [design, accessibility]
date: 2026-11-18
---
# Polish 2026-11-18: short audience pages, starting note under the list

PR #17355. Prompt: `polish/0`.

## What was weak

Three reports in a row carried the same item forward as item 1:
`polish-2026-11-18-starting-under-start-here.md`, `polish-2026-11-18-small-phone-hero.md` and
`polish-2026-11-18-phone-trail.md`. Five audience pages have fewer than eight tools: childcare,
photographers, pool-hot-tub, etsy-sellers and ebay-sellers. Those pages have no "Start here" row,
so the earlier fix (moving the `starting` note under Start here) did not reach them. Their hero still
held the note, and a row of jump chips came between the hero and the first card. At
320×640, four of them showed no tool on the first screen.

## What changed

`platform/pages/build.mjs`:

- `renderAudiencePage` passes the note as `copy.afterCards` when the page has no Start here row.
  `renderCategoryPage` draws it as `p.starting` inside `main`, after the last card, with
  `main > .starting { margin-top: 22px }`. The note's advice ("price one wedding here with your
  own editing time") is about the tools, so it reads naturally after them.
- `copy.noJumps` hides the jump chips on those pages. The whole list is one or two phone screens,
  so it is its own table of contents. Pages with eight or more tools keep their chips. Category and
  type pages are unchanged.

`platform/pages/audiences.test.mjs`: the placement test now requires the note to sit in `main` after
the last card on a short page, and a new test checks that a short page split across two categories
keeps its sections and drops the chips, while an eight-tool page keeps them.

## Measured (local build, `fold-check.mjs` plus a per-page probe)

These figures are where the first tool card starts, as a page y position in CSS px.

| page | 320×640 before | 320×640 after | 360×780 before | 360×780 after | 390×844 before | 390×844 after |
|---|---|---|---|---|---|---|
| childcare | 806 | 503 | 749 (deepest) | 473 | 739 (deepest) | 480 |
| photographers | 794 | 527 | passed | 457 | passed | 475 |
| pool-hot-tub | 754 | 487 | passed | 487 | passed | 491 |
| etsy-sellers | 641 | 461 | passed | 437 | passed | 481 |
| ebay-sellers | passed | 413 | passed | 413 | passed | 455 |

The before run printed only failures and the deepest page, so the 360 and 390 values for the other
four were not recorded. They all passed.

`fold-check.mjs` results:

- 320×640: before, 27 of 31 passed and the deepest card was childcare at 805. After, **31 of 31**
  passed and the deepest is for-creators at 596.
- 360×780: 31 of 31 both before and after. The deepest went from 749 to 572.
- 390×844: 31 of 31 both before and after. The deepest went from 739 to 613.

No page scrolls sideways at any of the three widths, by the probe's `scrollWidth > innerWidth` test.
At 1280 the note sits under the list at the column's 70ch width (screenshot below).

Screenshots, in `docs/reports/img/polish-2026-11-18-short-audience-pages/`:

- `before-childcare-320.png`
- `after-childcare-320.png`
- `after-childcare-note-desktop.png`

## Still weakest, and what I would do next

1. **for-creators at 596 on 320×640** is now the deepest page, with 28 px of slack. The next copy
   or hero change should be measured against it first.
2. **The 320 header is 106 px on tool pages** (carried over from `polish-2026-11-18-phone-trail.md`
   item 3). It is a sixth of a small screen on every page.
3. **Register `fold-check` in CI at 320×640 as well as 390×844.** This is a control-plane PR,
   carried over. With every page passing at all three sizes, the check can now gate without a
   backlog.
4. **The hero's count line on childcare names an exception** ("nothing you type is uploaded,
   except on Babysitting Business Kit"). It is three lines at 320. That is honest and should stay,
   but a shorter wording such as "one app sends data; see its page" would save a line.
