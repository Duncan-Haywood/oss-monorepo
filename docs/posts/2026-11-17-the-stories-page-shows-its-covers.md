---
title: "The Stories page now shows its four podcast covers"
date: 2026-11-17
tags: [design, stories, performance]
description: "The Stories hero left half a wide screen empty. It now shows each shelf's podcast cover. The thumbnails are 24 KB in total, and a phone downloads none of them."
---

The [Stories page](https://marisstella.app/stories/) collects four shelves of fiction:
Hearth & Horizon, For Other Minds, Little Lamps and Saints by Candlelight. Each shelf is a
podcast feed, and each feed has a cover that someone designed for podcast apps. Until today
the page didn't show any of them. On a laptop the hero was a column of text with an empty band
to its right, and the shelves were four text buttons.

The hero now has a two-by-two grid of the covers in that space. Each cover links to its shelf
further down the page. On a phone nothing changes: the shelves stay a row of buttons, because
four covers would push the first story well below the screen.

Two details mattered more than the layout:

- **Size.** The covers are 1,400 pixels square, which podcast apps need, and one of them is
  139 KB. The page shows them at about 140 pixels. So the page uses 320-pixel WebP copies,
  24 KB for all four, sharp on a high-density screen.
- **Phones fetch nothing.** The images are lazy-loaded and hidden below 900 pixels. A
  browser doesn't fetch a lazy image it never draws. On a 390-pixel screen, Playwright counted
  0 of 4 covers loaded, and the page's height was unchanged.

On a 1,280-pixel screen the hero grew by about 100 pixels. The first shelf still starts above
the fold. The change is in
[`platform/pages/stories.mjs`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/platform/pages/stories.mjs), with a test
that fails if a shelf's thumbnail goes missing.
