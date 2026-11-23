---
title: "Sony's raw files say vignetting correction is on. The camera's own JPEG shows none of it"
seo_title: "Sony ARW vignetting table vs the camera's own JPEG"
date: 2026-11-23
tags: [photo-editing, raw, sony, lens-correction, evaluation]
description: "We read a Sony ARW's vignetting table four ways and checked each against the JPEG the camera embedded. It follows the distortion table but lifts no corners."
---

Every Sony E-mount raw file carries three small tables describing the lens it
was shot with: how much it bends straight lines (distortion), how far red and
blue drift from green at the edges (lateral colour), and how much it darkens
toward the corners (vignetting). The camera uses them to correct its own JPEGs.
ShootFlow, the open-source raw developer in this repository, has applied the
first two since mid-November. It reads the third but does not apply it,
because the numbers looked too small: decoded the way darktable decodes them
today, the table brightens the corners by 0.6 to 1.0 stops, while lensfun's
calibration of the same lenses brightens them by about 2.6.

Either the table is a deliberately partial correction or we decode it wrong.
darktable has used two decodings itself: its first version squares the factor,
its current one does not. Squaring roughly doubles the stops, which is a big
difference. The obvious way to settle it is a photo of an evenly lit wall, but
none was available to us.

## Using the camera as the reference

Each raw file also contains a JPEG the camera made at the moment of capture,
and the maker note in our three sample files says vignetting correction was
set to "Auto". If that JPEG carries the correction, then comparing it with the
raw pixel by pixel shows how much brighter the camera made each ring of the
picture. The scene doesn't matter, because both images show the same scene.

So we wrote a check, `tools/sony_vignetting_preview_check.py`. It lines the
JPEG up on the raw by matching small patches. It learns the camera's tone curve
from the middle of the frame, where vignetting is negligible. Then, in each ring
from centre to corner, it works out how much brighter the JPEG is than that
curve predicts. On a synthetic image with a planted gain it recovers the gain to
within 0.04 stops per ring.

## What the JPEG shows

The alignment told us what kind of JPEG it is. On the A7 III, whose maker note
says distortion correction was on, the JPEG lines up with the raw to 0.41
preview pixels when we apply our reading of the distortion table, and is off by
3.06 pixels when we don't. On the A7 IV, where distortion correction was off,
it is the reverse: 0.14 pixels without the table, 3.97 with it. So this is the
camera's processed picture, and it confirms our distortion decoding a second
way.

The brightness tells a different story. On the two bodies with the
dynamic-range optimiser off, the JPEG is at most 0.04 stops brighter than the
centre, out to 82-90% of the way to the corner. At those radii the four
decodings predict between 0.31 and 1.27 stops. Only the A7 IV's four corners
rise, by 0.24 stops. So none of the decodings describes what the camera did:
in its own render, the luminance table was barely used.

## What we do with that

The camera's JPEG can't tell us which decoding is right, so the question stays
open until someone has an evenly lit frame from a Sony body. It does settle a
practical point: applying the table by default would not make ShootFlow's
output look more like the camera's, because the camera's own picture leaves the
corners alone. ShootFlow keeps reading and reporting the table without applying
it.

The full numbers, the method and the commands to rerun it on the same public
files are in `ventures/photo-editing/eval/sony-vignetting-preview-2026-11-23.md`.
