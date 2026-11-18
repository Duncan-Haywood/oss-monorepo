---
title: "Seventeen pixels: the page hero on a 320-pixel phone"
seo_title: "Small-phone layout: fitting the first card on a 320x640 screen"
date: 2026-11-18
tags: [polish, design, mobile]
description: "On a 320x640 phone, 24 of 31 audience pages hid their first tool below the screen, most by 17 px. One CSS block for small screens brought it to 12."
---

Earlier today the [audience pages](https://marisstella.app/c/for-painters/) got a browser
check: the first tool card has to be on a phone's first screen. They all passed at 390×844
and most passed at 360×780. At 320×640, the screen of a first-generation iPhone SE and many
cheap Androids, 24 of 31 still failed. Most of them failed by the same 17 pixels: the card
started at 641 px and needed to start by 624.

## Where the space went

The hero band at the top of every section page had 72 px of padding and margin around its text:
18 px above, 24 below and a 30 px gap before "Start here". The lede was 17 px type. On a wide
screen that air helps the page look calm. On a 640 px screen it's an eighth of the view.

## The change

One media query, only up to 400 px wide: 10 px above, 18 below, a 20 px gap, a slightly tighter
heading margin, and the lede at 16 px. The dark band itself doesn't shrink at the top, because it's
painted from above the padding. The text just sits a little closer to it.

| screen | pages failing before | after |
|---|---|---|
| 320×640 | 24 of 31 | 12 of 31 |
| 360×780 | 3 of 31 | 1 of 31 |
| 390×844 | 0 of 31 | 0 of 31 |

## What's left

The other twelve aren't a spacing problem. Four of them miss by 12 px because their heading wraps to
four lines, and five are short pages with a long tip box in the hero. Those are copy and layout
changes, page by page, and the [agent report](../reports/polish-2026-11-18-small-phone-hero.md)
lists them for the next run. The header's two rows (brand and search, then the section tabs) take
106 px on every page at this width, which may be the bigger lever.
