---
title: "Our 16-bit raw masters held 12 bits: one table read, fixed"
date: 2026-11-17
description: "ShootFlow's sRGB encode read a 4,096-entry table at the nearest entry. Interpolating a 16,384-entry one lifts 16-bit masters from 4,096 levels to 45,000-65,536."
tags: [photo-editing, raw, colour, image-quality]
---

ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, develops camera raw files into 16-bit
TIFF masters. A check earlier today, on a memory cut, found something odd: every output value that changed
moved by exactly one step of a 4,096-entry table. That table was the last thing the develop does, turning
linear light into sRGB, and it was read at the nearest entry. So a file sold as 16 bits per channel could hold
at most 4,096 different values per channel. That is 12 bits.

## Why it matters, and why nobody saw it

At 8 bits, nobody would notice: the largest step, 104 of 65,535 codes, is under half of one 8-bit step. The
problem is what a 16-bit master is for. A photographer opens it in an editor and pushes it. Lift the shadows
three stops and that 104-code step becomes about 830 codes, three 8-bit steps, and a smooth dark gradient can
start to band. The steps were also biggest where it hurts most: the sRGB curve is steepest just above black.

## The fix

Read a 16,384-entry table and interpolate linearly between its two nearest entries, then round once. On the
exact curve sampled 20 million times, that is never more than 0.22 codes off (the old read: 104), and every one
of the 65,536 output codes can occur. The pure-Python and numpy develop paths do the same float64 arithmetic
in the same order, and on two test files they still write identical bytes.

On five public camera DNGs (an LG phone, two Leicas, a DJI drone and a Pentax), developed at full size:

| file | distinct values per channel, before | after |
|---|---|---|
| LG Nexus 5X | 3,864-4,096 | 62,971-65,536 |
| Leica T | 4,025-4,096 | 55,696-65,528 |
| DJI Phantom 4 | 4,042-4,053 | 55,688-55,948 |
| Leica X Vario | 4,088-4,096 | 59,373-60,796 |
| Pentax Q-S1 | 2,239-2,349 | 45,014-46,246 |

Every value is now within one code of a reference made with a million-entry table. Before, 81-96% of values
were off it, by up to 104 codes.

## A free cross-check: LibRaw got closer

We compare the develop with LibRaw, the open-source raw library behind many photo tools, on the same files.
The gap had been small but never zero. With the new encode, the 99th-percentile gap fell from 0.136 to 0.035 of
an 8-bit step on the Leica T and from 0.160 to 0.047 on the Pentax. Most of what was left between the two
renders was this table. The phone's gap barely moved, as expected: its remaining difference is a fractional
black level that LibRaw rounds.

## What we haven't shown

We have not yet edited a real master to show banding before and after. The numbers above say the steps are
gone. Whether a photographer would have seen them depends on how hard they push the file, and that is the
next check. The method, the per-file rows and the tool that reproduces them are in
`ventures/photo-editing/eval/srgb-table-interp-2026-11-17.md`.
