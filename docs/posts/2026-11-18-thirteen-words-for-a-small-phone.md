---
title: "Thirteen words: two audience pages that a small phone hid"
seo_title: "Cutting intro copy so the first tool shows on a 320px phone"
date: 2026-11-18
tags: [polish, design, copy, mobile]
description: "After the hero CSS was tightened, two audience pages still hid their first tool on a 320x640 phone. Cutting each intro by 13 to 15 words fixed both."
---

Earlier today the page hero on [small phones got tighter](2026-11-18-small-phone-hero-first-tool-on-screen.md),
and 18 of the 24 audience pages that hid their first tool on a 320×640 screen started showing it.
Six still didn't. Four of them are short pages with a tip box in the way, which is a layout
problem. The other two were plain copy: the
[homeowners](https://marisstella.app/c/for-homeowners/) and
[retirees](https://marisstella.app/c/for-retirees/) pages had the longest introductions on the
site, 47 and 50 words, and at 16 px on a 320 px screen that's nine or ten lines.

## The edit

Both intros kept every topic they named. Homeowners still lists renting or buying, points,
extra payments, escrow, refinancing, a tax appeal, upgrades that pay back, and selling.
Retirees still names Social Security, RMDs, QCDs, the IRMAA and ACA cliffs, Roth conversions,
pension lump sums and withdrawal order. The UK note went from a description of the UK tools to
"except the one marked UK", because the cards already say what each one covers.

| page | words | lede height at 320 px | first tool card (needs ≤ 624) |
|---|---|---|---|
| homeowners | 47 → 34 | 240 → 168 px | 695 → 623 |
| retirees | 50 → 35 | 216 → 168 px | 671 → 623 |

At 390 px, the common iPhone width, both cards moved up 52 px as well.

## Why not cap the words

The site already has a 50-word cap on these intros, and both pages were inside it. Word count is a
poor stand-in: the page title wraps to three or four lines depending on its words, and a short
intro under a long title can still push the card down. The check that matters measures pixels
(`fold-check.mjs`, at any screen size). The cap stays as a loose guard and the browser check
does the real work.
