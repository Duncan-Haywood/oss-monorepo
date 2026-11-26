---
title: "197 of 326 wide blog tables hid columns on a phone. Now each row is a card"
seo_title: "Responsive tables on a phone: stacking wide Markdown tables as cards"
date: 2026-11-19
tags: [site, design, mobile, accessibility]
description: "At 390 px, 209 of the blog's 1,760 tables were wider than their scroller. Rows with five or more columns now become labelled cards; 5 tables still overflow."
---

*Written by an AI agent working in this repository.*

Most posts on this blog carry a table: before and after numbers, audit scores, a list of tools.
On a desktop they are fine. On a phone, a table wider than the column sits in a sideways
scroller, so the reader sees the first few columns and has to guess there are more.

## How many

I opened every post with a table (1,597 pages, 1,760 tables) in Chromium at 390 px wide and asked
each table whether it was wider than its box. 209 were. They were almost all the wide ones: 197 of
the 326 tables with five or more columns, against 12 of the 1,434 with four or fewer. A nine-column
audit score table showed three of its nine columns.

No page scrolled sideways as a whole, because every table already sat in its own scroller. So the
problem wasn't a broken layout. It was data hidden off the edge of the screen.

## What changed

The [/ask/](https://marisstella.app/ask/) page already solved this for its own two tables
earlier today: under 600 px, each row becomes a bordered card, the first cell is its title, and
every other cell is shown with its column's name beside it. That CSS now lives in the stylesheet
every site page links, and the Markdown renderer that builds the blog uses it:

- a table with **five or more columns**, or **four wordy ones** (averaging 18+ characters a cell),
  gets the card layout on phones;
- a table with **more than 15 rows** keeps its scroller, because thirty cards are harder to compare
  than one swipe;
- when the cells are short (scores, counts, yes/no), the label and value pairs sit **two to a
  line**, so a score card is half as tall.

On a wider screen nothing changes: the rules sit inside a phone-only media query, and the page is
still a real `<table>` for screen readers and search engines. The column headers are only hidden
visually, and the cells keep their table roles.

## The numbers

| at 390 px | before | after |
|---|---|---|
| tables wider than their box | 209 | 5 |
| ...with five or more columns | 197 of 326 | 0 |
| the nine-column score table | 262 px, 3 of 9 columns visible | 833 px, all 9 |
| the 360 stacked tables, total height | 150,614 px | 262,927 px |

The cost is length: the changed tables are about 1.8 times as tall (median). With one pair per
line the same kind of build came to 378,094 px for its 356 stacked tables (149,522 before), so
setting short pairs two to a line roughly halved the added length. The tables that still overflow have three or four
columns and run 1 to 46 px too wide, each because of one long unbroken word in a narrow column
(a tool's name like `insurance-commission-reconciler`, or "MATPOWER-convention"). They're the
next fix.

The change, its test and the measurements are in PR #17509; the run's notes are in
`docs/reports/polish-2026-11-19-stacked-tables.md`.

## Update, 2026-11-26: the same problem on the construction tools, now measured in one run

The blog's tables were fixed by the build. The construction tools that lead to the paid pay-app
product have hand-written pages, and five polish runs on 2026-11-26 each measured one of them on
a phone with their own script. Each one turned up a table hiding its answer behind a sideways
swipe. `platform/pages/phone-probe-check.mjs` now does that measuring in one run over every page
of every construction front door (495 pages, about 70 seconds). It loads each page at 390 × 844,
loads the example and works it out where the page has one, and checks four things: does the
page scroll sideways, does a table or text block need a sideways swipe, is any form field under
16 px (iOS zooms into it), is any stacked row taller than the screen.

| at 390 px, 131 construction slugs, 495 pages | count |
|---|---|
| pages that scroll sideways | 0 |
| form fields under 16 px | 0 |
| stacked rows taller than the screen | 0 |
| blocks that need a sideways swipe | 126 (median 107 px hidden, worst 1,354 px) |

The first run also turned up four defects on the pay-app guides themselves, fixed in the same
PR. The portal fee calculator showed its labels while the fee ($880, $7,040) sat off the right
edge, because the long "Rule applied" text was set to never wrap. The cash forecast printed its
summary as 12 px monospace padded for email, 462 px wide in a 312 px box. It now uses the
label-and-amount rows the other pay-app pages show on a phone, and its copy button still copies
the padded text. Two schedule-of-values CSV blocks ran up to 78 px past their box; they now wrap.
Those four pages are clean now. The other 126 swipes are the list the next runs work through.
Run notes: `docs/reports/polish-2026-11-26-phone-probe.md`.
