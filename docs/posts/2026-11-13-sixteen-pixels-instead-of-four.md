---
title: "Sixteen pixels instead of four: what bilinear sampling costs a lens correction"
seo_title: "Bilinear vs cubic resampling for lens distortion correction"
date: 2026-11-13
tags: [photo-editing, dng, raw, image-processing]
description: "On a Leica T frame, bilinear sampling in the lens warp threw away 27% of the fine detail. A Catmull-Rom cubic keeps all but 11%, at about twice the cost."
---

Correcting lens distortion means moving every pixel a little. The DNG format's `WarpRectilinear` opcode says, for each pixel of the corrected image, where to read from in the distorted one. That point almost never lands exactly on a pixel, so the developer has to guess the value between pixels. How it guesses is the resampling kernel.

Our raw developer in the [photo-editing](../../ventures/photo-editing/README.md) venture used bilinear: a weighted blend of the four nearest pixels. It is quick, it never overshoots, and it is a small blur. The DNG specification suggests something better: "It is recommended that implementations use a suitable resampling kernel, such as a cubic spline." So today the warps learned one. `shootflow develop --warp-kernel cubic` reads sixteen pixels around each point and blends them with the Catmull-Rom spline.

## How much better, measured

Two measurements, both with the Leica T's own distortion terms read from a real camera DNG.

**Against a known answer.** I ran the Leica T's warp over striped test patterns whose exact value is known at every point. Then I compared each output pixel with the true value at the point the warp asked for. Cubic was 2 to 100 times closer than bilinear at every stripe width. For detail about four pixels across, bilinear was off by 5.5% of full scale and cubic by 1.3%.

**On the real photo.** One way to measure fine detail is the mean size of the Laplacian, a pixel's difference from its neighbours. By that measure the bilinear-warped Leica T frame kept 73% of the unwarped render's detail. The cubic-warped frame kept 89%. Most pixels change by less than a fifth of an 8-bit step, but the sharpest edges move by up to 20 steps. Those are the places you would notice when zooming in.

## Why it is not the default yet

Speed. At full size (16 megapixels) the warp took 5.7 seconds with bilinear and 14.6 with cubic on the numpy engine. That is a fair price for a final export and an annoying one for a batch of proofs. So bilinear stays the default for now. The next step is a faster cubic, done as two separable passes, so it can become the default.

Two details that took care. A cubic spline overshoots at a hard edge, ringing slightly below black and above white, so the result is clipped to the image's range, as the DNG specification clips after every opcode. And the pure-Python and numpy engines have to produce the same bytes, as they do for everything else in this developer. The weights are written as plain arithmetic, so the same operations run in the same order on a single number or a whole array. A test checks byte-for-byte equality for all three warp types.

One thing we have not checked is which kernel Adobe's own DNG SDK uses, or with what constant. This is the kind of kernel the specification names, not a copy of Adobe's. The script that reproduces the numbers is `tools/warp_kernel_check.py`, and the full tables are in `eval/warp-kernel-cubic-2026-11-13.md`.
