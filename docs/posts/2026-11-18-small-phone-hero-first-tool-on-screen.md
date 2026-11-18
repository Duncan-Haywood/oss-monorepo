---
title: "Small phones now see a tool on the first screen: 24 of 31 pages fixed to 6"
seo_title: "First tool on screen at 320 px: a tighter hero on small phones"
date: 2026-11-18
tags: [polish, design, accessibility, site-build]
description: "On a 320×640 phone, 24 of 31 audience pages showed no tool on the first screen. One CSS block for narrow screens brought it to 6; 390 px is unchanged."
---

The catalogue has "free tools for …" pages for 31 audiences: roofers, landlords, retirees and so
on. They exist to put a tool in front of someone who searched for themselves, so a check
(`fold-check.mjs`) loads each one at phone size and asks whether the first tool card starts on
the first screen.

On a 390×844 iPhone every page passes. On a 320×640 screen (the first iPhone SE, and many small
Androids) **24 of 31 failed**, most by 17 pixels: the card's coloured top edge sat just under
the bottom of the screen. A visitor saw a dark header, a paragraph and "Start here", then had to
scroll before seeing anything to tap.

## What took the space

At 320 px the hero paragraph (the lede) was set at about 17 px and wrapped to seven lines, 184 px
tall. The rest was spacing: 26 px of dark field above the label, padding inside the hero, and
30 px between the hero and "Start here".

## The change

One `@media (max-width: 380px)` block in the shared page-hero stylesheet, plus two lines in the
category page styles:

- the lede drops to 16 px with a 1.5 line height (six lines instead of seven at 320 px);
- the hero's top and bottom padding, the gap under it, and the gap above "Start here" each lose
  4 to 8 px.

Nothing changes at 390 px or wider. The 390 px iPhone already passed and its 17 px lede reads
well, so the rule stops at 380 px, which still covers the 375 px iPhone SE and mini.

## Before and after

Pages whose first tool card is below the first screen, out of 31:

| screen | before | after |
|---|---|---|
| 320×640 | 24 | 6 |
| 375×667 | 6 | 3 |
| 360×780 | 3 | 1 |
| 390×844 | 0 | 0 |

On the landscapers page at 320×640 the first card moved from 641 px to 569 px, so its title is
now on screen as well as its border. The About, Writing, Stories and Updates heroes are 25 to 84
px shorter at 320 px, and identical at 390.

## What is left

Five audience pages have fewer than eight tools, so they have no "Start here" row: a "starting
out" note and a row of jump links sit above the first card, and at 320 px that is about 150 px
the CSS can't win back. Moving the note below the first group of tools is the next step. Two
long-copy pages (homeowners, retirees) need a shorter intro, which is a copy edit, not a spacing
one.
