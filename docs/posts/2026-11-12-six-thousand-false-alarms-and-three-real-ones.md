---
title: "6,228 false alarms and three real ones: sweeping 8,939 pages at tablet widths"
seo_title: "Horizontal scroll at tablet widths: the CSS 1fr min-content trap"
date: 2026-11-12
tags: [css, responsive-design, accessibility, playwright, open-source]
description: "A sweep of 8,939 pages at tablet widths flagged 6,230; all but two were the checker measuring too early. The real bugs: default-width inputs in 1fr grids."
---

The site has a checker, `sideways.mjs`, that opens every published page in
headless Chromium and asks one question: is the page wider than the window?
A page that is gets zoomed out or scrolls sideways, and a visitor on a tablet
sees the right edge of a calculator cut off. It had been run at phone widths
and at 820 and 900 px. Today it ran at four widths it had never covered:
600, 700, 1,040 and 1,100 px, across all 8,939 pages.

## The first answer was 6,230, and it was wrong

Almost every failure named the same thing as the widest box: the site header
on the tool pages, 440 px too wide at 600 px. 1,040 minus 600 is 440.

The checker loads each page once at the first width, then resizes the window
for the others. It waits one animation frame and measures. The header,
though, stretches itself to the window from a small script that listens for
`resize` and waits 60 ms before acting, so it isn't recomputed on every pixel
of a drag. One frame after a resize it still had the old width. The default
widths only ever make the window wider, so the gap had never shown up.

A visitor would see this for 60 ms when rotating a tablet. It is not a defect.
The checker now waits 150 ms and measures again whenever a resized width comes
out too wide, so clean pages cost nothing extra. Rerun: two failures.

## The real ones

There were three real pages (the first run had found one of them already):

- **The clothing design studio**, from 901 to about 1,300 px: 161 px too wide
  at 960. Two inputs in the screen-print form had no `type` attribute, so the
  stylesheet's `input[type=text] { width: 100% }` never reached them. They kept
  the browser's default width and pushed the grid open. The dropdown next to
  them was squashed down to the letter "F".
- **The 4×8 vs 5×5 plywood comparison** in the cut-list optimizer: 112 px too
  wide at 700.
- **The job margin variance calculator**: 101 px too wide at 700.

All three come down to one CSS rule that keeps catching people out. A grid
track sized `1fr` has a minimum of `auto`, which means "no narrower than my
content". An input with no width set has a content width of roughly 150 to
270 px, depending on font and padding. Put three of those in `1fr 1fr 1fr`
and the grid can't get narrower than about 800 px, whatever the window does.
The fix is to write the track as `minmax(0, 1fr)` and let the input fill its
cell (`min-width: 0; width: 100%`). Then the column decides the width, not the
input.

Each page is now 0 px too wide at 14 widths from 320 to 1,280, and each has a
test that pins the fix. The checker change matters more for the long run: a
sweep that cries wolf 6,000 times gets ignored, and these three pages would
have stayed hidden underneath.

Details and screenshots for the next run:
`docs/reports/polish-2026-11-12-wide-tablet-sweep.md`.
