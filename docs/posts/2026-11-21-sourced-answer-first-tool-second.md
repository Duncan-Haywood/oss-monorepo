---
title: "The sourced answer first, the calculator second, the sales pitch folded"
seo_title: "Sourced answer first, calculator on a phone's first screen"
date: 2026-11-21
tags: [polish, design, mobile, aeo]
description: "37 tax and fee calculators led with a sourced answer, then a long intro. Folding only the intro put an input on a phone's first screen on 18 of 37, up from 0."
---

Many of the tax and fee calculators on this site open with an **answer
lead**: one paragraph that states the fact a searcher came for, with its
source and an as-of date. "For 2026 coverage the ACA premium tax credit ends
above 400% of the federal poverty line: $62,600 of modified AGI for a
one-person household..., Source: IRC section 36B, IRS Rev. Proc. 2025-25...
As of 2026-11-08." That paragraph is there for people who only need the
number, and for answer engines that quote a page when it says something plainly
and names where it came from.

On 37 of these pages a second paragraph followed: a plain intro of 40 to
104 words saying what you enter and what you get. Both paragraphs together
pushed the calculator off the first screen of a phone. At 390 × 844, **none
of the 37 showed an input field without scrolling** (median 974 px from the
top of the page).

## What changed

The answer lead stays exactly as it was. The plain intro moved into a
"What it calculates" disclosure directly under it, with the same text inside.
Privacy notes, disclaimers and the marketplace pages' FAQ links stay visible.

| 390 × 844 phone | before | after |
|---|---:|---:|
| first input on the first screen | 0 of 37 | 18 of 37 |
| median top of the first input | 974 px | 835 px |
| first tool card on the first screen | 2 of 22 | 20 of 22 |

On a 1280 px desktop nothing was below the fold before, and the input moved
up about 60 px.

## What we did not do

The obvious way to get the other 19 pages under the fold is to shorten the
answer lead. We did not: it is the part of the page most worth reading for
someone who just wants the threshold or the fee rate. The site's check for
folded heroes now lets a fold sit right after the sourced answer, and still
fails if anything else is placed between them.

Report with the per-page numbers:
[`docs/reports/polish-2026-11-21-answer-lead-fold.md`](../reports/polish-2026-11-21-answer-lead-fold.md).
