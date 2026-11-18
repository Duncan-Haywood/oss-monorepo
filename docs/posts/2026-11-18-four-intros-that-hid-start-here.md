---
title: "Four intros that hid the \"Start here\" cards on a phone"
seo_title: "Shorter audience-page intros: Start here on the first phone screen"
date: 2026-11-18
tags: [polish, platform]
description: "Four household audience pages opened with 66 to 85-word intros that hid their first tool below a phone's fold. Now every audience page shows it on screen one."
---

The site's "for" pages ([roofers](https://marisstella.app/c/for-roofers/),
[landlords](https://marisstella.app/c/for-landlords/),
[homeowners](https://marisstella.app/c/for-homeowners/) and 28 more) each open with a short intro, a
"Starting out?" note, and then a **Start here** row: the three tools on that page with the most worked
questions behind them. On a phone that row is the point of the page. Someone who searched for
"calculators for retirees" should see a calculator before they scroll.

On the trade pages they do. On the four household pages added this week they did not.

## What was measured

Every audience page, rendered from a local build in Chromium at 390 × 844 px (a common phone size).
The number is how far down the page the first "Start here" card begins:

| Page | Intro words | Lede height | First card, before | After |
|---|---:|---:|---:|---:|
| [Homeowners & buyers](https://marisstella.app/c/for-homeowners/) | 85 → 41 | 368 → 184 px | 978 px | 794 px |
| [Retirees](https://marisstella.app/c/for-retirees/) | 67 → 41 | 289 → 184 px | 951 px | 820 px |
| [Parents & families](https://marisstella.app/c/for-parents/) | 72 → 42 | 289 → 158 px | 951 px | 819 px |
| [Changing or losing a job](https://marisstella.app/c/for-job-changers/) | 66 → 43 | 263 → 184 px | 873 px | 794 px |
| The 22 trade and seller pages with a Start here row | 21 to 44 | 105 to 184 px | 686 to 820 px | unchanged |

The screen ends at 844 px, so before the change all four household pages opened on a wall of text.
After it, the first card's top edge and number show on all 26 pages that have the row, with the
worst at 820 px. On a 1,280 px desktop the row moved up by 26 to 105 px.

## Why the intros grew

The trade intros name the work ("tear-offs and re-roofs, metal and flat roofs, gutters…"). The
household intros tried to name every tool: the Child Tax Credit, EITC, the dependent care FSA, nanny
tax, 529 to Roth, then four UK tools by their full statutory names. That list is already on the page
twice, once in the meta description and once as the tool cards themselves. The rewrite keeps the
kinds of decision and the one sentence that matters for trust (which tools follow US rules and which
follow GOV.UK) and leaves the inventory to the cards. The retirees page also lost five words from its
"Retiring in the next few years?" note, the last 26 px it needed.

## Keeping it fixed

`platform/pages/audiences.test.mjs` now fails when any audience intro passes 45 words, the length of
the longest trade intro that already cleared the fold. The next audience page someone writes gets
told at test time rather than by a visitor scrolling.

Nothing here is a traffic claim: the site's usage on these pages is unmeasured. It is a layout
measurement, and the before and after numbers above are the whole of it.
