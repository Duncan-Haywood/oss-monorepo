---
title: "Phase One IIQ S, read sensel for sensel: 547 million values equal to LibRaw"
seo_title: "Phase One IIQ S raw files read directly, checked against LibRaw"
date: 2026-11-18
tags: [photo-editing, raw, phase-one, iiq]
description: "ShootFlow now reads Phase One's smaller IIQ S raws, the setting aerial iXU and iXM cameras shoot. Six real files, 547 M sensels, none different from LibRaw."
---

This morning [ShootFlow](https://marisstella.app/photo-editing/), the open-source
photo pipeline in this repository, learned to develop Phase One IIQ files directly. It
read the full-size "IIQ L" setting and refused the smaller "IIQ S". That refusal hit more
files than it sounds like it would. On raw.pixls.us, the public CC0 archive of camera
samples, six Phase One files are IIQ S. It is the setting the iXU180, iXM-100 and
iXM-RS150F aerial cameras shot, and two of the four IQ180 files use it too. Survey flights
produce thousands of frames a day, and every one of them had to go through Capture One
or Adobe DNG Converter first.

As of this afternoon those files develop too.

## What the format does

IIQ S codes each sensor row on its own, eight columns at a time. Each block starts with a
small header. Each of the two colour lanes (even and odd columns) gets a scale, sent as a
step of minus one, zero or plus one from the last block, or as a fresh value in a short
prefix code. A refinement shared by both lanes comes next. Then come eight samples,
each a few bits wide, which move the lane's last value by a scaled, centred step. Scale 9
means "raw 14-bit samples follow". The last `width % 8` columns are always raw.

Phase One publishes no specification. The layout was learned from LibRaw's decoder,
which is LGPL/CDDL-licensed, reading it for the layout only. The reader here was written
independently, as the repository's CR3 and Panasonic readers were.

## The check

Every decoded value was compared with LibRaw 0.22 (through rawpy) on all six IIQ S
files, from five bodies:

| body | sensels | differing | read time |
|---|---|---|---|
| IQ180 (two files) | 101.6 M | 0 | 0.1-0.6 s |
| iXU180 | 81.1 M | 0 | 0.7 s |
| IQ3 100MP | 106.0 M | 0 | 0.7 s |
| iXM-100 | 104.2 M | 0 | 0.7 s |
| iXM-RS150F | 154.0 M | 0 | 1.2 s |

That is 546.9 million values with none different, and the white balance, colour pattern, crop
and orientation matched too. The same run read three IIQ L files from two bodies the morning's
check had not covered (IQ180, iXM-100): 205.8 million more values, again none different.

## The one case C leaves undefined

Three of the six files do something odd: in some blocks the refinement is larger than the
lane's scale. In LibRaw's C this becomes a shift by a negative count, which the C standard
leaves undefined. A reimplementation has to pick a meaning, and a wrong pick would corrupt
pixels in silence.

So the run counted those blocks instead of guessing. There are 880 such samples across the two
IQ180 frames and the iXU180, and all 880 carry zero bits.
Zero shifted any way is still zero, so a right shift, a wrapped left shift and "no step"
all give LibRaw's values on every sensel of those rows (1.6 million of them). The reader
accepts exactly that case. If a file ever puts non-zero bits there, the reader refuses it as
corrupt rather than inventing a meaning. `tools/iiq_s_shift_check.py` repeats the count on any file.

## What it does not do yet

The decoded values match exactly, but the levels after black do not always match. On the
iXU180, whose per-row offset tables reach -336, the blue-to-green ratio is 5.2% away from
LibRaw's render. LibRaw also applies Phase One's flat-field and defect corrections from the
file's metadata block, and ShootFlow does not apply them yet. That is the next item, along
with the 16-bit IIQ L setting of the IQ4 and the Trichromatic back. Both are still refused
with a message to convert to DNG.

The measurements and the files used are in
[`eval/phaseone-iiq-s-reader-2026-11-18.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/phaseone-iiq-s-reader-2026-11-18.md),
and the format-by-format list is on the
[camera RAW formats page](https://marisstella.app/photo-editing/camera-raw-formats.html).
