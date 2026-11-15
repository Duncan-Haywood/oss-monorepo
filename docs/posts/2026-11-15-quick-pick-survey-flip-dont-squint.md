---
title: "Flip, don't squint: comparing two photos on a phone"
seo_title: "How to compare two photos on a phone: flip, don't squint"
date: 2026-11-15
description: "On a phone our photo ranker drew two landscape photos at 135 by 90 px. Stacking gives five times the area; a full-screen flip with a shared zoom shows more."
tags: [quick-pick-survey, photo-culling, pairwise-comparison, mobile, product]
---

[Pick the best photo](https://marisstella.app/quick-pick-survey/pick-the-best-photo.html)
is a free ranker for a set of pictures: select 3 to 60 photos, logo drafts or
design options, answer "which is better?" two at a time, and get an order with
a rank range for each. The pictures are opened in your browser and never
uploaded.

It landed this morning with one known weakness: on a phone, the two pictures
sat side by side. We measured it in a 390 px wide Chromium window. A pair of
ordinary 3:2 landscape photos was drawn at **135 by 90 pixels each**. That is
a thumbnail. You cannot see whether an eye is closed or the focus is soft at
that size, and those are exactly the things a photo cull is about.

## Stack only when it clearly wins

Putting the two pictures one above the other is the obvious fix for landscape
photos, but not for every pair. A pair of tall phone screenshots is better
side by side, and on a desktop side by side is easier to take in at a glance.

So the page now works it out once both pictures have loaded. For each layout it
computes how big each picture would be drawn in the box the page gives it (no
cropping), takes the smaller of the two pictures, and stacks only when stacking
draws that one at least 1.5 times the area. Measured in the browser:

| screen | pictures | layout | each picture drawn at |
|---|---|---|---|
| phone, 390 x 844 | 3:2 landscape | stacked | 299 x 199 px (was 135 x 90, 4.9 times the area) |
| phone, 390 x 844 | 9:16 portrait | side by side | 135 x 240 px |
| desktop, 1280 x 900 | 3:2 landscape | side by side | 370 x 247 px |

The first stacked run turned up a second problem: the page kept the scroll
position from the Start button, so the top picture opened half above the
screen. A pair that does not fit on screen is now scrolled into view.

## Flip, the way photographers compare

Side by side is not how people who cull photos for a living compare two frames
either. Culling tools flip between them in the same spot, because a difference
you would miss across a gap jumps out when the picture changes under your eye.

"Look closer" (or the F key) does that: one picture full screen, and Space flips
to the other in the same place. Tap a spot and it zooms in three times there.
The zoom point is kept as a fraction of the picture, so when you flip you see the
same part of the other picture: the same eye, the same sign in the background.
For two frames from one camera it is exactly the same spot. Enter chooses the
picture on screen and opens the next pair full screen, so a whole cull can run
there.

The first browser test also found a real fault before it shipped. The
full-screen layer's `display: flex` rule beat the page's `hidden` rule, so an
invisible layer sat on top of the page and swallowed every click. A
hand-written check that opened the view would never have seen it; a test that
tried to press the Start button did.

## What we don't know yet

Whether flipping changes what people choose, or how fast. The page counts
`closer_opened` and `closer_pick` against ordinary picks in the visitor's own
browser (nothing is sent anywhere), so once people use it we will know how
much of a cull happens full screen. It does not judge picture quality. It only
records which picture you prefer.

[Try it with your own photos](https://marisstella.app/quick-pick-survey/rank.html),
or read the details in
[RANK-PAGE.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/docs/RANK-PAGE.md).
