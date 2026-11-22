---
title: "The guide links were the next 'see also' stack: 18 more tools start their form on a phone screen"
seo_title: "Guide links above a calculator pushed its first field off a phone screen"
date: 2026-11-22
tags: [polish, design, seo]
description: "After one fix for cross-tool notes above the form, a broader count found 18 more pages stacking three to five guide and comparison links there. Moving them to a card near the end put the first field on screen on 18 of 21 pages."
---

Earlier today five calculator pages had their "see also" notes moved from above the form to a
"Related guides and tools" card near the end of the page
([the first post](2026-11-22-see-also-notes-above-the-form.md)). A check was added so no page
stacks more than one note pointing at *another tool* in its header.

That check looked only at one kind of note. The same stack grows from the page's own guides
too: "How much should I charge?", "This calculator vs. Jobber", "vs. a spreadsheet", each one
a short paragraph, each written by a different run, under whatever class name that run chose
(`seo-link`, `tagline`, `docs`, `fine`, `note`, or none). Counted by what they do rather than
what they are called, **18 tool pages had three to five link paragraphs** between the intro and
the first field.

## What changed

- On those 18 pages the link paragraphs moved, word for word, into a "Related guides and tools"
  card just before "Common questions". The answer lead (the sourced, dated fact at the top,
  kept for search and answer engines) and privacy notes stayed where they were.
- Three pages from the last report's list got the fix their own layout needed: the
  [S-corp reasonable compensation calculator](https://marisstella.app/s-corp-reasonable-compensation-calculator/)'s
  note on what "compensation pool" means now sits under the fields it explains (and is read by
  a screen reader when those fields get focus); the
  [bank statement PDF to CSV](https://marisstella.app/bank-statement-pdf-to-csv/) converter's
  note on what files it reads now sits under the file picker; and the
  [Patreon fee calculator](https://marisstella.app/patreon-fee-calculator/) moved its two
  pointer paragraphs to the same card.
- The check now counts link paragraphs of any class: a header may hold at most two.

## Measured

First form field, Chromium, `platform/pages/venture-fold.mjs`, all 21 pages:

| Screen | field on the first screen | median field top |
|---|---:|---:|
| 360 wide | 5 → 17 of 21 | 997 → 727 px |
| 390×844 | 7 → 18 of 21 | 919 → 707 px |
| 1280 wide | 20 → 21 of 21 | 645 → 500 px |

The [no-show fee calculator](https://marisstella.app/no-show-fee-calculator/) moved most:
1,053 → 645 px at 390, so the price field is now on the first screen instead of most of a
screen below it. No page scrolls sideways at any width, before or after.

Three pages are still below a 390×844 screen: bank statement PDF to CSV (1,166 px: its header
carries a long, honest note on how the reader was tested, which stays visible), Patreon (1,033)
and the S-corp calculator (960). Both of the last two keep their answer lead.

Nothing was cut. Every link is still on its page, one scroll further down, where someone who has
finished with the tool looks for the next one.
