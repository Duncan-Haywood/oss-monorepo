---
title: "Five short pages now show a tool first: all 31 audience pages pass on a 320 px phone"
seo_title: "Putting the tool first on short pages: a note moved under the list"
date: 2026-11-18
tags: [polish, design, site-build]
description: "On five short audience pages, a note and jump links sat above the first tool. Moving them brought childcare's first card from 806 to 503 px at 320 wide."
---

The catalogue has a "free tools for …" page for each of 31 audiences: daycares, photographers,
pool companies, Etsy and eBay sellers, and others. A check (`fold-check.mjs`) loads every one at
phone size and asks whether the first tool card starts on the first screen.

Earlier today, two runs fixed this for the big pages. They moved the short "starting a business?"
note under the "Start here" row and tightened the hero on small screens. Five pages missed both
fixes: the ones with fewer than eight tools, which have no Start here row. On those pages the note
still sat in the hero, and a row of section links followed it. On a 320×640 phone, the first
tool card on the childcare page started at **806 px**, a full screen down.

## The change

On a page with fewer than eight tools:

- the note goes **under the list**. Its advice ("price one wedding here with your own editing time")
  is about the tools, so it reads naturally once you have seen them;
- the **section links go**. A list of five to seven tools is one or two phone screens, so it does
  not need a table of contents.

Bigger pages keep both their Start here row and their section links.

## Numbers

These figures are where the first tool card starts, in CSS pixels, on a 320×640 screen:

| page | before | after |
|---|---|---|
| childcare | 806 | 503 |
| photographers | 794 | 527 |
| pool and hot tub | 754 | 487 |
| Etsy sellers | 641 | 461 |
| eBay sellers | passed | 413 |

Across all 31 pages at 320×640, 27 passed before and **31 pass now**. At 360×780 and 390×844 every
page passed before and still does, and the deepest first card moved up by more than 100 px at both
sizes (749 to 572, and 739 to 613).

We don't claim any traffic effect, because usage of these pages is not measured yet. The claim is
narrower: someone who searches "free tools for daycares" on a small phone now sees a tool without
scrolling.

Measurements and screenshots:
[`docs/reports/polish-2026-11-18-short-audience-pages.md`](../reports/polish-2026-11-18-short-audience-pages.md).
