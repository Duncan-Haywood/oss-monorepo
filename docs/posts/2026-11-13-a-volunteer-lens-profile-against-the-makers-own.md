---
title: "A volunteer lens profile against the maker's own correction"
seo_title: "Lensfun distortion correction for CR2 and DNG raws, checked against a camera's own warp"
date: 2026-11-13
tags: [photo-editing, ventures, raw, dng, lensfun]
description: "ShootFlow now corrects lens distortion on raws that carry none, from lensfun's open database. On a Leica X Vario the profile and Leica's own correction differ by up to 8 px."
---

[ShootFlow](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/photo-editing) develops raw photos into 16-bit masters on your own machine. Yesterday it learned to apply the lens correction some cameras write into their DNG files. Most raw files carry none, though. Every Canon CR2 and the DNGs most cameras write leave the barrel or pincushion in the picture. Darktable, RawTherapee and Hugin fill that gap from [lensfun](https://github.com/lensfun/lensfun), an open database of distortion calibrations that volunteers have made for about 1,500 lenses.

`shootflow develop IMG.CR2 --lens-db lensfun/data/db` now does the same. The lens and focal length come from the file's EXIF. The database is read at run time and not shipped with ShootFlow, because its licence (CC BY-SA) differs from ours.

## Doing it lensfun's way, from lensfun's source

Applying a lensfun profile takes more than one formula. A tool has to find the lens from the name the camera wrote, pick the calibration for the right sensor size, interpolate between focal lengths, and convert between three coordinate systems. We read each step in lensfun's C++ source and ported it:

- **Names** are split into words by character class (`EF24-105mm` becomes `ef`, `24`, `105`, `mm`). Every word the camera wrote must appear in the database name.
- **Focal lengths** between calibrations use a cubic Hermite spline over the two nearest calibrations on each side.
- **Coordinates**: the profile's unit is half the height of the sensor it was calibrated on. Lensfun also rescales the profile so the centre of the frame keeps its size.

Put together, a lensfun profile is a polynomial in the distance from the centre with odd and even powers. That is exactly the DNG 1.6 `WarpRectilinear2` opcode ShootFlow already runs. So the profile becomes that opcode, with no fitting and no approximation. A test writes lensfun's own pipeline out separately, and the two agree to within a ten-millionth of a pixel. That holds for an interpolated focal length, a camera whose crop factor differs from the calibration's, a portrait frame, and all three of lensfun's distortion models.

## The whole database, and real files

All 6,500 calibrations in the database build a correction. Looked up by its own name, each of the 1,580 lenses finds itself first, or an alias of itself in 4 cases.

On a real Canon 600D CR2, ShootFlow read `EF100-400mm f/4.5-5.6L IS USM` at 100 mm, found the lens and developed the frame half size in 9.5 seconds. At full size the correction moves the corner 8 px at 100 mm and 32 px at 400 mm. A Canon 70D wrote its lens as just `105mm`, the way Canon bodies name third-party lenses. Lensfun's matcher would guess a Sigma macro from that. ShootFlow refuses and asks for `--lens` instead.

## When the maker and the volunteers disagree

One file in the sample set carries both kinds of correction. It is a Leica X Vario at 46 mm: the camera wrote its own correction into the DNG, and lensfun has a profile calibrated at exactly that focal length. We compared where each sends every 16th pixel of the 16-megapixel frame, after matching their zooms, which only set the framing:

| colour plane | largest gap | median gap | Leica's own correction, at most |
|---|---|---|---|
| red | 8.1 px | 1.3 px | 3.7 px |
| green | 8.1 px | 1.3 px | 3.8 px |
| blue | 8.2 px | 1.3 px | 3.8 px |

The gap is larger than the whole correction Leica applies. Leica's correction is a slight barrel fix. Lensfun's 46 mm entry is mostly a 1.3% zoom, plus a bend near the centre that Leica's even-power formula can't express. This file can't say which is right: its embedded preview turned out not to be lens-corrected at all. So the honest reading is narrow. For this lens at the long end, the two sources differ by up to 8 px at full size. Elsewhere, lensfun is the only correction there is.

ShootFlow's rule follows from that. A camera's own correction always wins, and lensfun is used only when a file carries none.

Details, tests and how to rerun every number: [the eval note](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/lensfun-correction-2026-11-13.md).
