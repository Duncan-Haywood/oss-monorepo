---
title: "The gap was in the ruler: our raw developer against LibRaw, measured properly"
seo_title: "LibRaw user_sat is black-subtracted: a raw comparison gone wrong"
date: 2026-11-12
tags: [photo-editing, shootflow, raw]
description: "ShootFlow's Canon renders looked 3-9% brighter than LibRaw's. The developer was fine: our check passed LibRaw a white level with black still in it."
---

Earlier today we checked ShootFlow's Canon CR2 reader on five real bodies against LibRaw, the
library behind most open-source raw tools. The sensor values matched to the last sensel. The
black levels, white balance and colour-filter layout matched too. The renders didn't: ShootFlow
came out 3-9% brighter in every channel, on every body, using LibRaw's own colour matrix. We
guessed the colour model was responsible and [made it the next thing to check](2026-11-12-five-canon-bodies-two-surprises.md).

We checked. The colour model wasn't the cause, and neither was ShootFlow.

## A flat gain is a units error

The first useful step was undoing the gamma curve and dividing one render by the other in linear
light. A colour-model difference would vary with hue and with how saturated a pixel is. What we
found was a constant: 1.14 on the 600D in every channel and every brightness band, give or take
1%. A constant gain usually means a units mistake somewhere.

The 600D's black level is 2,048 and its white level is 16,383. And 16,383 / (16,383 - 2,048) =
1.143.

That was the bug. Our check told LibRaw where white was with `user_sat`, passing the file's
white level as it sits in the raw data, black included. LibRaw reads `user_sat` *after* it has
subtracted black. So LibRaw scaled everything by 65,535 / 16,383 instead of 65,535 / 14,335, and
every LibRaw render we compared against was too dark by exactly that ratio. The prediction held
on every body: 1.067 on the 12-bit 350D (black 257, white 4,095), 1.143 on the 600D and 70D,
and 1.193 on the 7D, whose white level is lower because it clips early. The measured ratios were
1.05-1.07 on the 350D, 1.14 on the 600D and 1.19 on the 7D. The 70D read 1.07-1.15, because
it was also misaligned (below).

## Two more faults in the check

Fixing the units brought three bodies within half a percent. The other two still looked off, and
both had the same kind of cause.

**The 350D was compared on a different grid.** A half-size render turns each 2x2 block of sensels
(one red, two green, one blue) into one pixel. ShootFlow starts its blocks where Canon's maker
note says the image begins, row 19. LibRaw starts at row 14. Five is odd, so where one paired
rows 19 and 20, the other paired 20 and 21. Each half-size "pixel" mixed red, green and blue from
sensels a row apart. On a flat wall that doesn't matter. On a sky gradient it does, and the 350D's
greys came out 4-5% less blue. Over the whole frame the two agreed within half a percent, which
is how a misalignment hides. The check now moves ShootFlow's start by one row when the parities
differ, and rotates the colour layout and black levels to match.

**The 70D was compared one pixel off.** Its image starts 12 sensels from LibRaw's, which is six
half-size pixels. The check looked for the best alignment only up to four.

## What's left is a real difference, and it's small

With all three fixed, the median difference is 0.07-0.88 of an 8-bit step, down from 0.6-5.6.
To separate the data from the colour, we pushed ShootFlow's output back to camera values and
rendered it through dcraw's matrix instead of the DNG one. That agrees with LibRaw to 0.05-0.19
steps on all five bodies. The reader and the developer were right all along.

What remains is the colour model. ShootFlow follows the DNG specification: it works out the
light's colour, adapts it to a standard white in XYZ, then maps to sRGB. dcraw scales the camera's
channels and applies a matrix built for daylight. Both turn the shot's neutral grey into exact
grey. Away from grey they differ, more as the light moves further from daylight. The 7D and
5D Mark II frames, both near daylight, differ by 0.07-0.16 steps. The 70D frame is lit at about
4,700 K with a green tint, and differs by 0.88. Which of the two is closer to the real scene is a
question for a colour chart shot under that light, not for another comparison between programs.

## Why this was worth an afternoon

The guess in this morning's post was reasonable, and it was wrong. Acting on it would have meant
changing a colour model that follows the specification to match a number our own check got
wrong. A comparison tool needs the same suspicion as the code it tests. Here the giveaway was a
gain that stayed constant where a colour difference would have varied.

The fix is in `tools/cr2_develop_check.py`, with three new tests, and the full tables are in the
venture's `eval/cr2-brightness-gap-2026-11-12.md`. ShootFlow is MIT licensed and runs on your own
machine: `shootflow develop IMG_0001.CR2 --dcp PROFILE.dcp --out masters`.
