---
title: "Rechecking a noise check: most of the 'dark edge' was dim picture"
seo_title: "Masked sensels: dim picture lines passed the black test"
date: 2026-11-22
tags: [photo-editing, raw, noise, evaluation]
description: "Read through our own raw readers, the masked-sensel check found no new cameras, and a stricter test cut the usable files from 8 to 6 of 57."
---

This morning we [checked ShootFlow's noise estimate against the masked
sensels](2026-11-22-photo-editing-optical-black-read-noise.md) at the edge of
the sensor. These are sensels kept covered from light, so their spread is the
read noise itself. Through LibRaw, 8 of 57 public raws kept a usable masked
strip. The obvious next step was to read the same files through ShootFlow's own
raw readers. We expected those to cover the Nikon bodies LibRaw trims. They
did not, and the attempt showed the morning's test was too loose.

## What the readers keep

ShootFlow's CR2 and NEF readers mark a picture area inside the sensor, as
LibRaw does. Its Olympus, Panasonic, Sony, Samsung and Pentax readers keep the
whole sensor and put the camera's own picture in a crop. Read naively, that
looked like more coverage: 10 files instead of 8.

Then we looked at the lines themselves. Outside the camera's crop, an Olympus
E30 keeps **dim picture**: lines 13 to 17 counts above black, with a spread of
about 30. The morning's test kept any line whose median sat within 0.5% of the
white level of black, about 20 counts on a 12-bit file, so they passed. The
E30's real masked columns are its last four, at about 3.5 counts, inside the
edge we skip. A Canon 70D had the same problem on a smaller scale: twelve dim
lit columns 48 to 70 counts above black, plus three transition rows.

## Two stricter tests

- **Closer to black.** Every truly masked line we inspected sat within 4
  counts of black. The tolerance is now 0.1% of the white level, at least 2
  counts.
- **Quiet lines only.** Masked sensels are the quietest lines on the sensor.
  Each line's spread is read from differences with the next same-colour line,
  which cancels row banding. A line is kept only within 1.5x of the file's
  quietest tenth.

We also now skip files whose black level is 0. There the masked sensels are
clipped at zero, so their spread understates read noise by construction.

With these tests, **6 of 57** files read, and both readers give the same 6:
the Canon 350D, 600D, 7D and 70D, the Pentax K-1 Mark II and the LG Nexus 5X.
They agree within 2% in raw counts. Two of the morning's rows were not
readings. The Olympus E-P3's "masked" columns are a near-constant fill mixed
with dim lines. The Samsung NX3000 has a black level of 0. The 70D reads 7.15
counts, not 7.54. The morning's conclusion survives on the 6: the frame's own
read term is clamped to zero on 4 of them, and a masked floor would raise
deep-shadow noise by 11% to 123% on 5.

## Does the noise read see the border?

The same readers raised a second question. The developer reads its noise
model from the whole picture area the reader reports, so on those five makes
it also reads the border outside the camera's crop. We fitted the model on
both areas for the 30 files that have a crop. We also fitted a **control**: the
crop, shrunk until it lost the same share of area.

| sigma ratio | typical shift (1% / 10% / 50% of white) | files off by over 5% (of 30) |
|---|---|---|
| whole area / crop | 2.2% / 1.5% / 1.7% | 10 / 7 / 9 |
| shrunk crop / crop (control) | 3.6% / 2.7% / 3.0% | 11 / 9 / 11 |

Across the set, the border moves the model *less* than dropping an equal slice
of the picture does. So reading from the crop is not a fix, and the developer
stays as it is. Three files are the exception: a Panasonic GF7, a Samsung NX20
and a Sony A7M4. On those the border alone lifts deep-shadow sigma 1.37 to
1.49x while the control barely moves.

The control is itself the most useful number here. Removing about 2% of a
frame moves the estimate by more than 5% on a third of files, and halves the
estimated noise at half of white on a Panasonic GF1. The estimator is less stable to its sample than its
held-out scores suggested, which makes that the next thing to measure.

Method, rows and tests: `ventures/photo-editing/eval/optical-black-shootflow-readers-2026-11-22.md`,
`tools/optical_black_floor.py --reader shootflow`, `tools/frame_noise_crop_area.py`.
