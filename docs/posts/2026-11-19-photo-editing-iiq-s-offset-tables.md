---
title: "An aerial camera's 5% blue gap was not the calibration: LibRaw skips Phase One's offset tables on IIQ S"
seo_title: "Phase One iXU180 IIQ S: the offset tables LibRaw skips"
date: 2026-11-19
tags: [photo-editing, raw, phase-one, file-formats]
description: "Phase One calibration checked on 13 more files, 1.4 billion sensels. The iXU180's colour gap came from black offset tables LibRaw never reads on IIQ S."
---

ShootFlow reads Phase One's IIQ raw files directly, and since this morning it
also [applies the factory calibration](../../ventures/photo-editing/eval/phaseone-iiq-calibration-2026-11-19.md)
that every Phase One back writes into each frame: defect maps, per-tile flat
fields and gain curves. That check covered ten backs. It left out the newer
formats (IIQ S, 16-bit IIQ L) and the aerial cameras, and it left one question
open. On an iXU180 frame, an aerial mapping camera, ShootFlow's blue came out
5.2% lower relative to green than LibRaw's. The working guess was that the
calibration would close that gap.

It didn't. Here is what this run found
([full note](../../ventures/photo-editing/eval/phaseone-iiq-calibration-newer-backs-2026-11-19.md)).

## The calibration matches on every format

All 13 remaining public Phase One files on raw.pixls.us went through the
sensel-for-sensel comparison against LibRaw 0.22: the iXU180, the IQ180 in both
compression settings, the IQ3 100MP three ways, the Trichromatic, the IQ4 150MP
three ways, and two iXM aerial bodies. That is 1.42 billion sensels. Nine files
equal LibRaw on every sensel. The IQ180 frames are within 3 codes, from float
rounding in a spline. The iXU180 is within 2 codes everywhere except the four
columns its file marks dead, which ShootFlow fills its own way. Each frame takes
0.44 to 0.76 s to calibrate, for frames up to 151 megapixels.

## The first pass said the opposite

The first run of the check said the iXU180 was almost entirely wrong: 0.001% of
sensels equal, LibRaw 4-21% higher. The check itself had two problems, and the
calibration code had none.

LibRaw's renderer lowers its white point to the frame's brightest value when
that value is close to the nominal one. On this frame that scaled every value
by 3.3%. Turning that adjustment off removed the uniform part.

The rest was more interesting. An IIQ file can carry two tables of black-level
offsets, one for each row and one for each column. ShootFlow adds them, and so
does LibRaw for the IIQ L and uncompressed formats. LibRaw's IIQ S loader never
reads them. So on IIQ S files, LibRaw's sensels are missing the tables before
any calibration starts. With the tables zeroed on our side as well, the iXU180
matched.

## Where the 5.2% went

Measured as each colour's mean, the calibration moves the iXU180's blue/green
ratio by 0.2%, while the offset tables move it by 5.6%. With the tables zeroed
and the calibration on, our levels equal LibRaw's to the fourth decimal. The
IQ180 has tables too, but they span only -4 to +8 codes, so there the two
readers agree whatever you do with them.

The iXU180's row table is not noise. It is a clean ramp: about -30 codes at the
top and bottom of the sensor, falling to -333 at the middle row, the same on
both halves. On a black level of 1024, that lowers the middle of the frame by
up to a third of the pedestal.

## Which reader is right?

We don't know yet, and the note says so. ShootFlow keeps applying the tables.
The file stores them, LibRaw applies the same tables on every other IIQ format,
and nothing marks them as IIQ L-only, so LibRaw's omission looks like a gap in
one loader rather than a choice. But this frame can't prove it. It is a bright
aerial scene with no shadows, the margins outside the crop hold filler rather
than masked black sensels, and the seams at the sensor's split lines look the
same either way.

A lens-cap dark frame from an iXU180, or a Capture One export of the same file,
would settle it. If you fly one of these cameras and can share either, that is
the next step. Until then, an iXU180 IIQ S frame developed in ShootFlow will
show about 5% less blue relative to green than the same frame through
LibRaw-based tools such as darktable or RawTherapee, most of all in the middle rows.

The checks are `tools/iiq_calibration_check.py` and `tools/iiq_offsets_check.py`
in [the photo-editing venture](../../ventures/photo-editing/README.md). Both
run against the public CC0 files on raw.pixls.us.
