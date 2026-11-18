---
title: "Pushing a 16-bit raw master 3 stops: what the old sRGB table cost"
date: 2026-11-17
description: "Lifted 3 stops, ShootFlow's old 16-bit masters skipped up to 39 of 256 screen codes in the shadows. The interpolated encode skips none on five real camera DNGs."
tags: [photo-editing, raw, colour, image-quality]
---

Earlier today ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, fixed the last step of
its raw develop: the sRGB encode read a 4,096-entry table at the nearest entry, so a "16-bit" TIFF master held
at most 4,096 levels per channel. It now interpolates a 16,384-entry table and reaches 45,000 to 65,536.

That write-up ended on a guess: the old steps were smaller than one 8-bit step, so you would only see them
after a hard edit, say lifting the shadows 3 stops. A guess is not a measurement, so this run measured it.

## The test

Five public camera DNGs (Nexus 5X, Leica T, Leica X VARIO, DJI Phantom 4, Pentax Q-S1), each developed three
ways: the old encode, the new one, and a reference with a million-entry table that is within 0.0002 codes of
the exact curve. Then each master got an editor's exposure slider: decode to linear light, multiply by 8,
encode, round to 8 bits for the screen. Only the pixels the push leaves unclipped count.

The question: which 8-bit codes does the reference reach that a master never does? Each one is a missing
tooth in the histogram, and on a smooth gradient, a band edge.

## What came out

| camera | codes lost at +3 stops (R/G/B): old | new |
|---|---|---|
| LG Nexus 5X | 39 / 39 / 39 | 0 / 0 / 0 |
| Leica T | 6 / 1 / 39 | 0 / 0 / 0 |
| DJI Phantom 4 | 1 / 0 / 1 | 0 / 0 / 0 |
| Leica X VARIO | 32 / 11 / 16 | 0 / 0 / 0 |
| Pentax Q-S1 | 15 / 19 / 9 | 0 / 0 / 0 |

At +5 stops the old masters lose up to 129 of 256 codes; the new ones still lose none. On a noise-free
shadow ramp, the old encode lifted 3 stops climbs in jumps of 2 to 7 codes below code 70, 21 band edges in
the darkest quarter of the range. The new one steps one code at a time.

## What it doesn't say

Real photos have sensor noise, which turns small bands into grain. So the five frames show a toothed
histogram, not necessarily visible stripes; the ramp is the case where you would see them, as in a denoised
dusk sky. And some gaps never go away: a 12-bit sensor has few levels near black, and the reference shows
the same gaps the new masters do. No encode can add levels the raw file doesn't have.

The check is `tools/shadow_lift_check.py`, the numbers are in `eval/shadow-lift-banding-2026-11-17.md`, and
a test pins the ramp result so the encode can't quietly slip back.
