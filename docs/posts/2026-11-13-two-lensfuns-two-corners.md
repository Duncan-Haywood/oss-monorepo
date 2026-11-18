---
title: "Two versions of lensfun brighten the same corner differently"
seo_title: "lensfun vignetting: release 0.3.4 vs master, checked on 97,382 cases"
date: 2026-11-13
tags: [photo-editing, ventures, raw, lensfun]
description: "ShootFlow's lensfun vignetting port matches liblensfun 0.3.4. Lensfun's release and master still differ by up to 10% on steep lenses."
---

[ShootFlow](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/photo-editing) develops raw photos on your own machine. Earlier today it learned to brighten dark lens corners using [lensfun](https://lensfun.github.io/)'s open database of lens measurements. We wrote that code from lensfun's C++ source. Then we checked it against the same formula, written out a second time by the same reader. That shows the code does what we read. It doesn't show we read the source correctly.

So this time we ran lensfun's compiled code itself. The Python package lensfunpy bundles liblensfun 0.3.4, lensfun's latest release, along with that release's database. We gave lensfun an image where every pixel is 1.0 and asked it to correct the vignetting. Each pixel then comes back as lensfun's brightening factor for that position. We compared those factors with ours.

## 97,382 shots, one millionth apart

The check covered 474 lenses. For each one we tried every focal length, f-number and focus distance the lens was measured at. We also tried the points halfway between measured f-numbers and between measured focal lengths, where lensfun has to interpolate. Each of those ran on two frame shapes at two sensor sizes, 97,382 cases in all.

| | median | 99th percentile | largest |
|---|---|---|---|
| our port vs liblensfun 0.3.4 | 0.00012% | 0.0034% | 0.32% |

There was no case where lensfun corrected and we didn't, or the other way round. The largest gaps all come from lensfun's own arithmetic. It does the sums in single precision and keeps a running total along each row. Those small rounding errors grow when the brightening factor is large. The worst case was a Sony RX100 VI at 10.38 mm, where the corner gets brightened 93 times. We re-ran lensfun's loop in single precision and it matched the library to 1.6 parts in a million.

Ten lenses have measurements that, taken literally, need a negative brightening near the corners. Most of these cases come from a fisheye whose corners fall outside its image circle. Lensfun turns those pixels black. ShootFlow declines to correct those 133 cases at all and says so in its notes.

## Where release and master part

The check also turned up a real difference inside lensfun itself. Before comparing, we had to adjust for it.

A lens measurement says how dark the image gets at a given distance from the centre. That distance is in units of the sensor's half-diagonal, so the code has to know how many pixels the diagonal spans. The 0.3.4 release measures it from the centre of the first pixel to the centre of the last: `hypot(width − 1, height − 1)`. Lensfun's unreleased master branch measures from edge to edge: `hypot(width, height)`. A crop factor describes the physical sensor, edge to edge, so master is right. ShootFlow follows master.

On a 6,000-pixel-wide photo the two units differ by about a hundredth of a percent, and for most lenses that changes nothing. But a lens whose corners fall off steeply turns that small change in radius into a big change in brightness:

| corner brightness, master vs 0.3.4 | median | 99th percentile | largest |
|---|---|---|---|
| 6,000 px frame | 0.0075% | 0.12% | 10% |
| 800 px preview | 0.056% | 0.86% | 46% |

The 10% is that same RX100 VI case. Two raw editors, one linked against the release and one against master, will brighten its corners a tenth apart. On an 800-pixel preview they are 46% apart. Neither is wrong about the formula. They disagree about the size of a pixel.

## What a user gets

ShootFlow doesn't apply lensfun's formula directly. It writes the correction as a standard DNG vignette instruction, a polynomial fitted to lensfun's curve. On an 800 px frame that instruction is within 1.2% of the 0.3.4 release at the 99th percentile. The worst case was 15%, on a Canon G1X Mark II. Of that, 9.1% is the polynomial fit, still under the 10% at which ShootFlow refuses a correction, and 4.6% is the pixel-unit difference above.

## Still open

None of this involves a real photo. The next check needs a white wall or a clear sky, shot wide open, to see whether the corners come out level and how far lensfun's measurement of one copy of a lens fits another copy. The full numbers are in [`eval/lensfun-vignetting-released-2026-11-13.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/lensfun-vignetting-released-2026-11-13.md), and `tools/lensfun_vignetting_released_check.py` reruns the check with `pip install lensfunpy`.
