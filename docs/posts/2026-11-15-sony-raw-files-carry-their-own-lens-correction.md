---
title: "Every Sony Raw File Carries Its Own Lens Correction. Now ShootFlow Uses It."
seo_title: "Sony ARW Embedded Lens Correction, Checked Against Lensfun"
date: 2026-11-15
tags: [photo-editing, raw, lens-correction, sony]
description: "Sony E-mount ARWs store the lens's distortion and fringe curves. Checked against lensfun on three real frames: within 9 px on 84-411 px corrections."
---

When a Sony A7 makes a JPEG, it straightens the lens's barrel distortion and pulls in the red and blue
fringes toward the corners. The curves it uses for that are not secret: every ARW from an E-mount body
writes them into the raw file, as three small tables of 16-bit numbers (tags 0x7037, 0x7035 and 0x7032).

Until today [ShootFlow](/photo-editing/), the open-source photo pipeline in this repository, corrected an
ARW's lens only from lensfun's community database. If you had no database, or your lens wasn't in it, you got
the raw geometry, bowed horizons and all. Now `shootflow develop` reads the camera's own tables and corrects
distortion and lateral colour from them. A lensfun match still wins when you give one.

## Does the decoding hold up?

The format isn't documented by Sony. darktable reads it: knots evenly spaced from the image centre to the
corner, fixed-point values scaled by 2^-14 for distortion and 2^-21 for colour. We wanted to check that
reading against something independent before applying it to anyone's photos.

So we took the three public sample ARWs that carry the tables (an A5000, an A7 III and an A7 IV, from the
metadata-extractor test-image collection) and compared Sony's curve with lensfun's own calibration of the
same lens at the same focal length:

| frame | lens | correction at the corner | Sony vs lensfun, worst gap |
|---|---|---|---|
| A5000 | E PZ 16-50mm at 16 mm | 11.9% barrel, 411 px | 9.0 px |
| A7 III | FE 24-105mm F4 G at 24 mm | 6.2% barrel, 222 px | 7.3 px |
| A7 IV | FE 24-70mm F2.8 GM II at 42 mm | 2.3% pincushion, 84 px | 3.4 px |

(pixels on a frame 6000 px wide). Two calibrations from two sources agree to within 2-4% of the correction.
That's about as close as lensfun and a camera maker's own correction usually agree. On a Leica we measured
earlier the gap was 8 px. Reading the knots the other way round (as raw-frame radii) fits worse on all three
frames, and six times worse on the strongly distorted 16 mm.

## What we didn't switch on

The colour-fringe tables agree with lensfun on two of the three frames. On the A7 III they disagree, and we
can't tell which source is right without a test shot with sharp corner detail.

The vignetting table is read but not applied. Decoded the way darktable does it, it brightens the corners
by 0.6 to 1.0 stops, where lensfun's calibrations of the same lenses brighten them by about 2.6. Sony may
correct only part of the falloff on purpose, or the formula may be off. One evenly lit test shot would
settle it, and until then we leave it out.

The method, every number and the script that produced them are in the venture's
`eval/sony-in-file-corrections-2026-11-15.md`. ShootFlow is MIT licensed. Its estimates aren't a substitute
for checking your own frames.
