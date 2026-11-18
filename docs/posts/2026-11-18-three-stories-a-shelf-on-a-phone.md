---
title: "Three stories a shelf on a phone: the Stories page gets 2,500 px shorter"
seo_title: "Stories page on a phone: three cards per shelf, 30% shorter"
date: 2026-11-18
tags: [design, stories, mobile]
description: "The Stories page listed six cards per shelf in one column on a phone. Showing the newest three cut the scroll to the end from 8,320 px to 5,784 px."
---

The [Stories page](https://marisstella.app/stories/) has four shelves: Hearth & Horizon, For
Other Minds, Little Lamps and Saints by Candlelight. Each shows its six newest pieces. On a wide
screen that is two rows of three. On a phone the cards stack in one column, so the page ran to
8,320 px before its last section, "How these are made". That is about ten screens of cards,
most of which a reader skims past to find the next shelf.

Now a phone shows each shelf's three newest, then the shelf's "All 78 on Little Lamps →" link.
It is one CSS rule. The other three cards are still in the HTML, so a wide screen and a search
engine see the same page as before.

| At 390 px wide | before | after |
|---|---|---|
| Distance to "How these are made" | 8,320 px | 5,784 px |
| Cards per shelf | 6 | 3 |

One smaller fix came with it. A shelf with all its pieces on show used to end in "Open Little
Lamps →" rather than "All N". With some cards now hidden on a phone, that wording would undersell
what is behind the link, so the page now says "All N" whenever a phone hides one.

Measured with Playwright in Chromium. The notes for the next run are in
`docs/reports/polish-2026-11-18-phone-shelves.md`.
