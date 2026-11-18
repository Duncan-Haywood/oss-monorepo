---
title: "Phase One IIQ files, from the P25 to the IQ3 100MP, developed with the colour matrix they carry"
seo_title: "Develop Phase One IIQ raw files without Capture One"
date: 2026-11-18
tags: [photo-editing, ventures, raw, phase-one]
description: "ShootFlow now reads Phase One IIQ L raw files directly and needs no camera profile. On ten backs every sensor value matched LibRaw 0.22."
---

[ShootFlow](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/photo-editing) turns a card full of raw photos into graded 16-bit masters on your own machine. Its card copy has kept Phase One's `.IIQ` files since 2026-11-16, but the grade stopped at them and asked for a DNG first. From today it reads them itself, and, unlike every other non-DNG format it reads, it needs no camera profile to do it.

## Whose files these are

Phase One makes digital backs for medium-format cameras: the P25 and P30 of the mid-2000s, the P+ series (P20+ to P65+), the IQ series up to the 150 MP IQ4, and the iXU and iXM aerial cameras. People shoot product, architecture, art reproduction and survey work with them, and keep the backs in service for years. Their own software is Capture One. Anyone who wants a scripted, offline batch develop has had to convert first.

## What an IIQ is

An IIQ is a TIFF on the outside: the first IFD holds the maker, the model, the exposure details and a small thumbnail. The sensor lives in a second container that starts at byte 8 with the four letters `IIII`. Its directory gives the sensor size, the margins, the data format, a table with one offset per row, the black level, and the as-shot white balance.

The common setting, IIQ L, codes each row on its own. Every eight columns, each of the two colour lanes reads a short prefix that picks one of ten difference lengths, from 5 to 14 bits; then each value is the last value in its lane plus a difference of that length. Length 14 means a raw 16-bit value instead, and so do the last few columns of a row that is not a multiple of eight wide. The P+ backs use a variant whose codes below 256 stand for a squared value, `v * v / 3.969`, so 255 comes out as 16,383, the 14-bit maximum.

Two things are easy to miss:

- **Black is not one number.** Many of these sensors are read out in two halves, and the file stores a small black offset for each row's left and right half and each column's top and bottom half. On a P45+ they reach 75 levels. dcraw adds them; so does ShootFlow, while keeping the black level itself as a level, so the noise below it is not clipped away.
- **The file carries its own colour.** Each IIQ stores a 3x3 matrix from the camera's white-balanced values to ROMM, the ProPhoto colour space. Multiply through ROMM's fixed conversion to XYZ and the as-shot gains, invert, and you have a DNG colour matrix calibrated at D50 that sends the as-shot neutral exactly to D50 white. So an IIQ develops like a DNG: `shootflow develop CF000001.IIQ --out masters`, no `.dcp` needed.

## Checked against LibRaw

raw.pixls.us, a public CC0 collection of sample raws, has files from 17 Phase One backs and cameras. Ten IIQ L files from ten of them were checked: the H 25, P25, P20+, P25+, P30, P45+, P65+, IQ140, IQ150 and IQ3 100MP. On all ten, every one of 342.7 million sensor values matched LibRaw 0.22. So did the colour filter layout, the as-shot white balance and the orientation. With the optional C decoder a 106-megapixel IQ3 100MP file reads in 0.8 seconds.

With the black level and offsets applied, each colour's average over the frame is within 0.7% of LibRaw's own linear render on nine of the ten. The P45+ is about 2% off. LibRaw also applies Phase One's per-sensor flat-field and defect corrections, which ShootFlow does not yet. Developed all the way to sRGB, eight of nine frames land within 0.02 in chromaticity of LibRaw's picture. The ninth, a dark P25+ frame, is at 0.026. The two programs use different colour models (LibRaw's is dcraw's, ShootFlow's follows the DNG specification), so that gap is a difference of method, not of decoding.

## What it does not read yet

IIQ S, the smaller setting, uses a different codec. It is the only setting on the IQ180 and iXU180 files at hand, so those are refused with a message to convert to DNG, and the cull still scores them from their embedded preview. The uncompressed formats and the IQ4's 16-bit format are refused the same way, because no public file was at hand to check them against.

The full measurements are in [the evaluation record](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/phaseone-iiq-reader-2026-11-18.md), and the format-by-format list is on the [camera RAW formats page](https://marisstella.app/photo-editing/camera-raw-formats.html).
