---
title: "Looking for one rare Nikon format detail turned up a bug that made 12-bit NEFs develop nearly black"
seo_title: "Nikon 12-bit NEF black level and Z 6II lossy raw, checked"
date: 2026-11-15
description: "We probed 235 public Nikon raw files for a rare split row. The split rows decoded right, but three other faults showed up, one of them in every 12-bit NEF."
tags: [photo-editing, raw, nikon, evaluation]
---

The photo-editing pipeline reads Nikon NEF files without Adobe's converter. Until today it had been checked on seven real files, and every sensel matched LibRaw's. One part of the format had never run on a real file, though. Lossy NEFs can change Huffman tables part-way down the frame, at a "split row" named in the maker note. None of the seven had one.

## Finding a split row

raw.pixls.us publishes camera samples under CC0. It has 235 NEFs from 92 Nikon bodies. Downloading all of them would have meant several gigabytes. Instead a short script fetched the first 512 KB of each file with an HTTP range request and read maker-note tag 0x0096, which holds the format version, the tone curve and the split row. Eleven files had a non-zero split row: a Nikon 1 J5, a D3400, D5000, D5200, D5500, two D5600 frames, a D5, a D7000 and two Z 6II frames.

## The split rows were fine

On all nine files in the usual stepped-curve format, every sensel matched LibRaw's, split rows included. The after-split tables had been written from the format description and tested only on synthetic files, and they decoded real data right the first time.

## Three other faults

The same run turned up three faults the original seven files could never have shown.

**The Z 6II's lossy format.** The Z bodies write version 0x44 0x40, which the reader didn't know. It fell through to the branch for a fully stored curve and got 99.3% of the sensels wrong. LibRaw reads this version like the older stepped format, but with the step and the curve's range divided by four. With that change, all 24.5 M sensels match on both Z 6II files.

**12-bit black levels, four times too high.** Nikon stores the black level on a 14-bit scale even when the file is 12-bit. A 12-bit Z 6II frame says 1008, and its real black is 252. Every earlier test file was 14-bit or had no stored level. The damage was large: between 82% and 95% of each 12-bit frame's sensels sat at or under the wrong black, so the frame developed almost entirely black. That affected any 12-bit NEF from roughly 2014 on, which is when bodies started storing a black level. The level is now divided by 4 for 12-bit files, and all four 12-bit files match LibRaw.

**Two picture columns cut.** Yesterday's rule for finding masked edge columns treats a column as picture when it correlates at 0.8 or more with the same-colour column two further in. On busy, lossy D3400 and D5600 frames, the first real column correlates at 0.70 to 0.80, so the rule cut two columns of picture. We measured every masked edge column on all 18 bodies. All but one vary by less than a quarter of the noise floor, so the variation test alone rejects them. The one exception, the D70's last column, correlates at −0.005. The bar is now 0.5. A darkening stress test across all 18 files keeps 53 of 54 picture-only frames whole. The one it cuts is a 12-bit frame pushed 6 stops under: 2 columns on each side, out of 6,064.

## Where it stands

All 18 real NEFs now match LibRaw in every sensel LibRaw decodes, and in black level, white balance, CFA pattern and visible area. The J5 keeps two bottom rows that LibRaw skips, because they are picture. The checker reports them separately rather than counting them as differences. The full table, the probe and the stress output are in [`eval/nikon-nef-split-row-2026-11-15.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/nikon-nef-split-row-2026-11-15.md).

The point for anyone writing a raw decoder: we went looking for a rare format detail and it turned out fine. The test-set gaps that hid real bugs were simpler ones. None of the seven original files was 12-bit with a stored black level, and none came from a Z body.
